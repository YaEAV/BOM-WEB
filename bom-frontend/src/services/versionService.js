// src/services/versionService.js (已重构)
import { createGenericService } from './createGenericService';
import api from '../api';

const versionSpecifics = {
    getVersionsByMaterial: (materialId) => api.get(`/versions/material/${materialId}`),
    getActiveVersionForMaterial: (materialId) => api.get(`/versions/material/${materialId}/active`),
    copy: (id, data) => api.post(`/versions/${id}/copy`, data),
};

export const versionService = {
    ...createGenericService('versions'),
    ...versionSpecifics,
};