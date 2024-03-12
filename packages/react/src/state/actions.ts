import { ContentType, Dictionary, FormState, Nullable } from '../models';
import { getDefaultValue, getEmptyFieldValue } from './fields';
import { getIsLastPage, getNextPage, getPageIdAt, getPageIndex, getPreviousPage, reduceFields } from './shared';
import { CreateStoreArgs } from './store';
import { validate } from './validation';

function getDefaultFormValue(form: ContentType, language: string) {
    return reduceFields(form, field => getDefaultValue(field, language));
}

function getEmptyFormValue(form: ContentType) {
    return reduceFields(form, field => getEmptyFieldValue(field));
}

function isPromise(o: any): o is Promise<any> {
    return typeof o?.then === 'function';
}

export function createActions({ set, getState }: CreateStoreArgs<FormState>) {

    const setWithProgress = (updates: (state: FormState) => FormState) => {
        set((state) => {
            const nextState = updates(state);
            if (!Object.is(nextState, state)) {
                saveProgress(nextState);
            }
            return nextState;
        });
    };

    let loadingPromise: null | Promise<void> = null;
    const setForm = (form: ContentType | Promise<ContentType>) => {
        if (isPromise(form)) {
            set(state => ({ ...state, loading: true }));
            const p = form.then(
                (form) => {
                    set((state) => (p === loadingPromise) ? onSetForm(state, form) : state);
                    loadingPromise = null;
                },
                (loadError) => {
                    set((state) => (p === loadingPromise) ? ({ ...state, loadError, loading: false }) : state);
                    loadingPromise = null;
                }
            );
            loadingPromise = p;
        } else {
            loadingPromise = null;
            set((state) => onSetForm(state, form));
        }
    };

    const setValue = (fieldId: string, fieldValue: any) => setWithProgress((state) => onSetValue(state, fieldId, fieldValue));
    const setInputValue = (fieldId: string, fieldInputValue: any) => set((state) => onSetInputValue(state, fieldId, fieldInputValue));
    const setFocussed = (fieldId: string, focussed: boolean) => set(state => onSetFocussed(state, fieldId, focussed));
    const submit = () => {
        let canSave = false;
        setWithProgress(state => {
            let s = onSubmit(state);
            canSave = s.canSave;
            return s.state;
        });
        return canSave;
    };

    const previousPage = () => setWithProgress(state => onPreviousPage(state));

    const gotoPage = (pageId: string, trigger: 'popstate') => setWithProgress(state => onGotoPage(state, pageId, trigger));

    const resetProgressInStorage = () => resetProgress(getState());

    const getFormResponse = () => {
        const { value, form, language } = getState();
        return {
            ...value,
            sys: {
                contentTypeId: form?.id as string,
                dataFormat: 'form' as const,
                language
            }
        };
    };

    const getConfirmationRules = () => {
        const { form } = getState();
        return form?.properties?.confirmationRules;
    };

    return {
        setForm,
        setValue,
        setInputValue,
        setFocussed,
        getFormResponse,
        getConfirmationRules,
        submit,
        previousPage,
        gotoPage,
        resetProgress: resetProgressInStorage
    };
}

function currentPageHasErrors(state: FormState) {
    const currentPageFieldIds = (state.form?.fields || []).filter(f => f.groupId === state.currentPageId).map(f => f.id);
    return !!currentPageFieldIds.some(id => !!state.errors[id]);
}

function onSetForm(state: FormState, form: ContentType): FormState {
    const firstPageId = getPageIdAt(form, 0);
    let currentPageId = firstPageId;

    const defaultValue = getDefaultFormValue(form, state.language);
    const emptyValue = getEmptyFormValue(form);
    let value = defaultValue;

    const progress = loadProgress(form);
    if (progress) {
        const hasSavedPage = !!form.groups?.find(g => g.id === progress.page);
        if (hasSavedPage) {
            currentPageId = progress.page;
        }
        value = Object.keys(value).reduce((prev, key) => {
            if ((typeof progress?.value?.[key] !== 'undefined') && (typeof value?.[key] !== 'undefined')) {
                // check both are defined, progress so we know we can set the value and value to check that the form field still exists
                prev = {
                    ...prev,
                    [key]: progress.value[key]
                };
            }
            return prev;
        }, value);
    }

    const errors = form?.fields.reduce((prev, f) => ({
        ...prev,
        [f.id]: validate(value[f.id], f, state.language)
    }), {} as Dictionary<any>);

    const hasErrors = Object.keys(errors).some(key => !!errors[key]);
    currentPageId = hasErrors ? firstPageId : currentPageId;

    return {
        htmlId: state.htmlId,
        form,
        language: state.language,
        currentPageId,
        value,
        defaultValue,
        emptyValue,
        inputValue: value,
        errors,
        showErrors: false,
        focussed: null,
        loading: false,
        loadError: null,
        defaultPageTitle: state.defaultPageTitle
    };
}

function onSetValue(state: FormState, fieldId: string, fieldValue: any): FormState {
    const { form, errors, value, language } = state;
    const field = form?.fields.find(f => f.id === fieldId);
    if (field) {
        const fieldErrors = validate(fieldValue, field, language);
        state = {
            ...state,
            value: {
                ...value,
                [fieldId]: fieldValue
            },
            errors: {
                ...errors,
                [fieldId]: fieldErrors
            }
        };

        return {
            ...state,
            showErrors: state.showErrors && currentPageHasErrors(state)
        };
    } else {
        return state;
    }
}

function onSetInputValue(state: FormState, fieldId: string, fieldInputValue: any): FormState {
    const { form, inputValue } = state;
    const field = form?.fields.find(f => f.id === fieldId);
    if (field) {
        return {
            ...state,
            inputValue: {
                ...inputValue,
                [fieldId]: fieldInputValue
            }
        };
    } else {
        return state;
    }
}

function onSetFocussed(state: FormState, fieldId: string, focussed: boolean): FormState {
    if (focussed) {
        return {
            ...state,
            focussed: fieldId
        };
    } else if (state.focussed === fieldId) {
        return {
            ...state,
            focussed: null
        };
    }
    return state;
}

function onSubmit(state: FormState): { canSave: boolean, state: FormState } {
    const isValid = !currentPageHasErrors(state);
    if (isValid) {
        const isLastPage = getIsLastPage(state.form, state.currentPageId);
        const nextPage = getNextPage(state.form, state.currentPageId);
        if (nextPage) {
            addToHistory(nextPage, 'push');
            return {
                canSave: false,
                state: {
                    ...state,
                    showErrors: false,
                    currentPageId: nextPage
                }
            };
        } else if (isLastPage) {
            return {
                canSave: true,
                state: {
                    ...state,
                    showErrors: false
                }
            };
        }
    }
    return {
        canSave: false,
        state: {
            ...state,
            showErrors: true
        }
    };
}

function onPreviousPage(state: FormState): FormState {
    const previousPage = getPreviousPage(state.form, state.currentPageId);
    if (previousPage) {
        addToHistory(previousPage, 'replace');
        return {
            ...state,
            showErrors: false,
            currentPageId: previousPage
        };
    }
    return state;
}

function onGotoPage(state: FormState, pageId: string, trigger: 'popstate'): FormState {
    const currentPageIndex = getPageIndex(state.form, state.currentPageId);
    const newPageIndex = !!pageId ? getPageIndex(state.form, pageId) : 0;
    if (newPageIndex >= 0) {
        if (currentPageIndex < newPageIndex) {
            const isValid = !currentPageHasErrors(state);
            if (isValid) {
                const nextPage = getNextPage(state.form, state.currentPageId);
                if (nextPage && (nextPage === pageId)) {
                    if (trigger !== 'popstate') {
                        addToHistory(pageId, 'push');
                    }
                    return {
                        ...state,
                        showErrors: false,
                        currentPageId: pageId
                    }
                }
            } else {
                if (trigger === 'popstate') {
                    history.back();
                }
                return {
                    ...state,
                    showErrors: true
                };
            }
        } else if (currentPageIndex > newPageIndex) {
            // going back
            if (trigger !== 'popstate') {
                addToHistory(pageId, 'push');
            }
            return {
                ...state,
                showErrors: false,
                currentPageId: pageId || getPageIdAt(state.form, newPageIndex)
            };
        }
    }
    return state;
}

function addToHistory(pageId: Nullable<string>, action: 'push' | 'replace') {
    if (typeof pageId === 'string') {
        if (action === 'push') {
            history.pushState(pageId, '', ''); //`#${pageId}`);
        } else {
            history.replaceState(pageId, '', ''); // `#${pageId}`);
        }
    }
}

function saveProgress(state: FormState) {
    if (state.form?.id) {
        localStorage.setItem(
            `contensis-form-${state.form?.id}-page`,
            state.currentPageId || ''
        );
        localStorage.setItem(
            `contensis-form-${state.form?.id}-value`,
            !!state.value ? JSON.stringify(state.value) : ''
        );
    }
}

function resetProgress(state: FormState) {
    if (state.form?.id) {
        localStorage.removeItem(`contensis-form-${state.form?.id}-page`);
        localStorage.removeItem(`contensis-form-${state.form?.id}-value`);
    }
}

function loadProgress(form: ContentType) {
    if (!!form) {
        const page = localStorage.getItem(`contensis-form-${form.id}-page`);
        const jsonValue = localStorage.getItem(`contensis-form-${form.id}-value`);
        if (page && jsonValue) {
            try {
                const value = JSON.parse(jsonValue);
                return {
                    page,
                    value
                };
            } catch {

            }
        }
    }
    return null;
}
