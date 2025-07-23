// src/services/versionService.js (扩展版)
import { createGenericService } from './createGenericService';
import api from '../api';

// 专属于version的特定接口
const versionSpecifics = {
    getVersionsByMaterial: (materialId) => api.get(`/versions/material/${materialId}`),
    copy: (id, data) => api.post(`/versions/${id}/copy`, data),
};

// 整合通用服务和特定服务
export const versionService = {
    ...createGenericService('versions'),
    ...versionSpecifics,
};