// src/services/versionService.js (已增加 copy 方法)
import api from '../api';

export const versionService = {
    get: (params) => api.get('/versions', { params }),
    getVersionsByMaterial: (materialId) => api.get(`/versions/material/${materialId}`),
    getActiveVersionForMaterial: (materialId) => api.get(`/versions/material/${materialId}/active`),
    create: (data) => api.post('/versions', data),
    update: (id, data) => api.put(`/versions/${id}`, data),
    // --- 核心新增 ---
    copy: (id, data) => api.post(`/versions/${id}/copy`, data),
    delete: (ids) => api.post('/versions/delete', { ids }),
    restore: (ids) => api.post('/versions/restore', { ids }),
    deletePermanent: (ids) => api.post('/versions/delete-permanent', { ids }),
    getAllIds: (params) => api.get('/versions/all-ids', { params }),
};