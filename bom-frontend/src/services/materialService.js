import api from '../api';

export const materialService = {
    get: (params) => api.get('/materials', { params }),
    getById: (id) => api.get(`/materials/${id}`),
    create: (data) => api.post('/materials', data),
    update: (id, data) => api.put(`/materials/${id}`, data),
    delete: (ids) => api.post('/materials/delete', { ids }),
    restore: (ids) => api.post('/materials/restore', { ids }),
    export: (ids) => api.post('/materials/export', { ids }, { responseType: 'blob' }),
    getAllMaterialIds: (search) => api.get('/materials/all-ids', { params: { search } }),
};