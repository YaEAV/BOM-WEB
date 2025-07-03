// src/services/versionService.js (已修改)

import api from '../api';

export const versionService = {
    getVersions(params) {
        return api.get('/versions', { params });
    },

    updateVersion(id, data) {
        return api.put(`/versions/${id}`, data);
    },

    deleteVersions(ids) {
        return api.post('/versions/delete', { ids });
    },

    // 新增的函数
    getActiveVersionForMaterial(materialId) {
        return api.get(`/versions/material/${materialId}/active`);
    },
};