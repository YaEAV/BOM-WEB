// src/services/unitService.js (新文件)

import api from '../api';

export const unitService = {
    getUnits(params) {
        // The backend was updated to support pagination, so we pass params
        return api.get('/units', { params });
    },
    // Add other unit-related API calls here if needed
};