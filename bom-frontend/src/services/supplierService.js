import api from '../api';

export const supplierService = {
    get: (params) => api.get('/suppliers', { params }),
    create: (data) => api.post('/suppliers', data),
    update: (id, data) => api.put(`/suppliers/${id}`, data),
    delete: (ids) => api.post('/suppliers/delete', { ids }),
    restore: (ids) => api.post('/suppliers/restore', { ids }),
};