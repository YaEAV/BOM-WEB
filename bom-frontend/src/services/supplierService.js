// src/services/supplierService.js (新文件)

import api from '../api';

export const supplierService = {
    getSuppliers(params) {
        // The backend was updated to support pagination, so we pass params
        return api.get('/suppliers', { params });
    },
    // Add other supplier-related API calls here if needed in the future
};