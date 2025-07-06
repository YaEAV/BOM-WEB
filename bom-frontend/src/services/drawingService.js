// src/services/drawingService.js (新建文件)
import api from '../api';

export const drawingService = {
    getDrawingsForMaterial: (materialId) => api.get(`/materials/${materialId}/drawings`),
    upload: (materialId, formData) => api.post(`/materials/${materialId}/drawings`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
    delete: (ids) => api.post('/drawings/delete', { ids }), // 软删除
    deleteBatch: (ids) => api.post('/drawings/delete-batch', { ids }), // 物理删除
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