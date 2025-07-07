// src/services/materialService.js (最终版本)
import api from '../api';

export const materialService = {
    get: (params) => api.get('/materials', { params }),
    getById: (id) => api.get(`/materials/${id}`),
    create: (data) => api.post('/materials', data),
    update: (id, data) => api.put(`/materials/${id}`, data),
    delete: (ids) => api.post('/materials/delete', { ids }),
    restore: (ids) => api.post('/materials/restore', { ids }),
    export: (ids) => api.post('/materials/export', { ids }, { responseType: 'blob' }),

    /**
     * 获取所有符合当前搜索条件的物料ID
     * @param {object} params - 包含搜索词等参数的对象
     */
    getAllIds: (params) => api.get('/materials/all-ids', { params }), // <-- 已补全

    deletePermanent: (ids) => api.post('/materials/delete-permanent', { ids }),
};