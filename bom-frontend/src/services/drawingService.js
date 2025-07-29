// BOM-WEB/bom-frontend/src/services/drawingService.js
import { createGenericService } from './createGenericService';
import api from '../api';

const drawingSpecifics = {
    getDrawingsForMaterial: (materialId) => api.get(`/materials/${materialId}/drawings`),
    upload: (materialId, formData) => api.post(`/materials/${materialId}/drawings`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
    activateVersion: (materialId, version) => api.put('/drawings/activate/version', { materialId, version }),
    downloadVersion: (materialId, version) => api.get('/drawings/download/version', {
        params: { materialId, version },
        responseType: 'blob'
    }),
    downloadSingle: (drawingId) => {
        window.open(`${api.defaults.baseURL}/drawings/${drawingId}`);
    },
    exportBom: (materialId) => api.post('/drawings/export-bom', { materialId }, { responseType: 'blob' }),
};

export const drawingService = {
    ...createGenericService('drawings'),
    ...drawingSpecifics,
};