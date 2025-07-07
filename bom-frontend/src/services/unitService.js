import api from '../api';

export const unitService = {
    get: (params) => api.get('/units', { params }),
    create: (data) => api.post('/units', data),
    update: (id, data) => api.put(`/units/${id}`, data),
    delete: (ids) => api.post('/units/delete', { ids }),
    restore: (ids) => api.post('/units/restore', { ids }),
    deletePermanent: (ids) => api.post('/units/delete-permanent', { ids }),
    getAllIds: (params) => api.get('/units/all-ids', { params }),
};