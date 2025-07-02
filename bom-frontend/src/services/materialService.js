// src/services/materialService.js (新文件)

import api from '../api';

export const materialService = {
    getMaterials(params) {
        return api.get('/materials', { params });
    },

    getMaterialById(id) {
        return api.get(`/materials/${id}`);
    },

    createMaterial(data) {
        return api.post('/materials', data);
    },

    updateMaterial(id, data) {
        return api.put(`/materials/${id}`, data);
    },

    deleteMaterials(ids) {
        return api.post('/materials/delete', { ids });
    },

    getAllMaterialIds(search) {
        return api.get('/materials/all-ids', { params: { search } });
    },

    exportMaterials(ids) {
        return api.post('/materials/export', { ids }, { responseType: 'blob' });
    },

    importMaterials(formData) {
        return api.post('/materials/import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },

    getWhereUsed(id) {
        return api.get(`/materials/${id}/where-used`);
    }
};