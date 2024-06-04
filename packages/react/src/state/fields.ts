import { localeInfo } from '../dates';
import { Field, FieldDataFormat, FieldDataType, FieldEditorId, FieldEditorType, FormFieldOption, Nullable } from '../models';
import { localisations } from './localisations';

const DEFAULT_DATA_TYPE_EDITOR_TYPES: Record<FieldDataType, FieldEditorType> = {
    boolean: 'checkbox',
    dateTime: 'date',
    decimal: 'decimal',
    integer: 'integer',
    string: 'text',
    stringArray: 'radio'
};

const DEFAULT_DATA_FORMAT_EDITOR_TYPES: Record<FieldDataFormat, FieldEditorType> = {
    email: 'email',
    phone: 'tel',
    reference: 'reference',
    time: 'time',
    url: 'url'
};

const DEFAULT_EDITOR_ID_EDITOR_TYPES: Record<FieldEditorId, FieldEditorType> = {
    date: 'date',
    datetime: 'datetime',
    decimal: 'decimal',
    integer: 'integer',
    list: 'radio',
    'list-dropdown': 'select',
    multiline: 'multiline',
    text: 'text'
};

export function getFieldEditorType(field: Field) {
    let editorType: Nullable<FieldEditorType> = field.editor?.id ? DEFAULT_EDITOR_ID_EDITOR_TYPES[field.editor.id] : null;
    if (!editorType && field.dataFormat) {
        editorType = DEFAULT_DATA_FORMAT_EDITOR_TYPES[field.dataFormat];
    }
    if (!editorType && (field.validations?.allowedValues?.values || field.validations?.allowedValues?.labeledValues)) {
        editorType = (field.dataType === 'stringArray')
            ? 'multiselect'
            : 'radio';
    }
    editorType = editorType || DEFAULT_DATA_TYPE_EDITOR_TYPES[field.dataType];
    return editorType || 'text';
}

const EMPTY_FIELD_VALUES: Record<FieldDataType, any> = {
    boolean: false,
    dateTime: null,
    decimal: null,
    integer: null,
    string: '',
    stringArray: null
};

export function getEmptyFieldValue(field: Field) {
    return EMPTY_FIELD_VALUES[field.dataType];
}

export function getOptions(field: Field, htmlId: string): undefined | FormFieldOption[] {
    const pairs = field?.validations?.allowedValues?.labeledValues
        ? field?.validations?.allowedValues?.labeledValues?.map(value => value)
        : field?.validations?.allowedValues?.values?.map(value => ({ value, label: value }));

    
    let options = pairs?.map((pair, index) => {
        return {
            key: `${index}`,
            htmlId: `${htmlId}-option-${index}`,
            value: pair.value,
            label: pair.label,
        };
    });

    if (getFieldEditorType(field) === 'select') {
        const emptyOption = options?.find(o => o.value === '');
        if (!emptyOption) {
            options = [
                {
                    key:'',
                    htmlId: `${htmlId}-option--1`,
                    value: '',
                    label: field?.editor?.properties?.placeholderText || localisations.pleaseSelect 
                },
                ...(options || [])
            ];
        }
    }

    return options;
}

export function getDefaultValue(field: Field) {
    const defaultValue = typeof field?.default !== 'undefined' ? field.default : getEmptyFieldValue(field);
    if ((field.dataType === 'dateTime') && (defaultValue === 'now()')) {
        return (getFieldEditorType(field) === 'datetime')
            ? getNowDateTime()
            : getNowDate();
    } else if ((field.dataType === 'string') && (field.dataFormat === 'time') && (defaultValue === 'now()')) {
        return getNowTime();
    }
    return defaultValue;
}

export function getInputValue(field: Field, value: unknown) {
    if (field.dataType === 'dateTime') {
        const editor = getFieldEditorType(field);
        if (editor === 'datetime') {
            return localeInfo().toShortDateTimeString(value as string | Date);
        } else {
            return localeInfo().toShortDateString(value as string | Date);
        }
    }
    return value;
}

function getNowDate() {
    return toLocalIsoDate(new Date());
}

export function getNowDateTime() {
    return toLocalIsoDateTime(new Date());
}

function getNowTime() {
    return toLocalIsoTime(new Date());
}

function toLocalIsoDate(dt: Date) {
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T00:00`;
}

function toLocalIsoDateTime(dt: Date) {
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function toLocalIsoTime(dt: Date) {
    return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

const AUTO_SAVE_PROGRESS_EXPIRY_DAYS = 30;

export function getProgressExpiry() {
    const d = new Date();
    d.setDate(d.getDate() + AUTO_SAVE_PROGRESS_EXPIRY_DAYS);
    return toLocalIsoDateTime(d);
}

function pad(n: number, length: number = 2) {
    const padding = Array.from({ length }).map(() => '0').join('');
    return `${padding}${n}`.slice(-1 * length)
}
