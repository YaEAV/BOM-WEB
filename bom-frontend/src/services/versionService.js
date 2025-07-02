// src/services/versionService.js (新文件)

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
};