// src/services/lineService.js (新建文件)
import { createGenericService } from './createGenericService';
import api from '../api';

const lineSpecifics = {
    // 可以在这里添加BOM行特有的API调用，如果未来有需要的话
};

export const lineService = {
    ...createGenericService('lines'), // 使用通用服务创建基础的CRUD
    ...lineSpecifics,
};