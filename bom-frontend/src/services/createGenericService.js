// src/services/createGenericService.js (新建文件)
import api from '../api';

export const createGenericService = (resource) => ({
    get: (params) => api.get(`/${resource}`, { params }),
    getById: (id) => api.get(`/${resource}/${id}`),
    getAllIds: (params) => api.get(`/${resource}/all-ids`, { params }),
    create: (data) => api.post(`/${resource}`, data),
    update: (id, data) => api.put(`/${resource}/${id}`, data),
    delete: (ids) => api.post(`/${resource}/delete`, { ids }),
    restore: (ids) => api.post(`/${resource}/restore`, { ids }),
    deletePermanent: (ids) => api.post(`/${resource}/delete-permanent`, { ids }),
});