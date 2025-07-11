// src/services/materialService.js (已重构)
import { createGenericService } from './createGenericService';
import api from '../api';

const materialSpecifics = {
    export: (ids) => api.post('/materials/export', { ids }, { responseType: 'blob' }),
};

export const materialService = {
    ...createGenericService('materials'),
    ...materialSpecifics,
};