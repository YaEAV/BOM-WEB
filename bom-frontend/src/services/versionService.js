import api from '../api';

export const versionService = {
    get: (params) => api.get('/versions', { params }),
    getVersionsByMaterial: (materialId) => api.get(`/versions/material/${materialId}`),
    getActiveVersionForMaterial: (materialId) => api.get(`/versions/material/${materialId}/active`),
    create: (data) => api.post('/versions', data),
    update: (id, data) => api.put(`/versions/${id}`, data),
    delete: (ids) => api.post('/versions/delete', { ids }),
    restore: (ids) => api.post('/versions/restore', { ids }),
};