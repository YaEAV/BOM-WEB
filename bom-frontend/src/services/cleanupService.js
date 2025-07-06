// src/services/cleanupService.js (新建文件)
import api from '../api';

export const cleanupService = {
    getEmptyBomVersions: () => api.get('/cleanup/empty-bom-versions'),
    getUnusedMaterials: () => api.get('/cleanup/unused-materials'),
    getOrphanedDrawings: () => api.get('/cleanup/orphaned-drawings'),
};