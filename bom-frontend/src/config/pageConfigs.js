// src/config/pageConfigs.js (已添加备注列)
import { materialService } from '../services/materialService';
import { supplierService } from '../services/supplierService';
import { unitService } from '../services/unitService';
import { versionService } from '../services/versionService';

// --- Base Configurations ---

export const materialPageConfig = {
    service: materialService,
    columns: [
        { title: '物料编号', dataIndex: 'material_code', sorter: true, showSorterTooltip: false },
        { title: '产品名称', dataIndex: 'name', sorter: true, showSorterTooltip: false },
        { title: '规格描述', dataIndex: 'spec' },
        { title: '物料属性', dataIndex: 'category', sorter: true, showSorterTooltip: false },
        { title: '单位', dataIndex: 'unit' },
        { title: '供应商', dataIndex: 'supplier', sorter: true }, // 确认供应商列存在
    ],
    searchPlaceholder: '搜索物料编码、名称或规格...',
    initialSorter: { field: 'material_code', order: 'ascend' },
    getExtraParams: () => ({}),
};

export const supplierPageConfig = {
    service: supplierService,
    columns: [
        { title: '供应商名称', dataIndex: 'name', sorter: true },
        { title: '联系人', dataIndex: 'contact' },
        { title: '电话', dataIndex: 'phone' },
        { title: '地址', dataIndex: 'address', width: 300 },
    ],
    searchPlaceholder: '搜索供应商名称或联系人...',
    initialSorter: { field: 'name', order: 'ascend' },
    getExtraParams: () => ({}),
};

export const unitPageConfig = {
    service: unitService,
    columns: [
        { title: '单位名称', dataIndex: 'name', sorter: true },
    ],
    searchPlaceholder: '搜索单位名称...',
    initialSorter: { field: 'name', order: 'ascend' },
    getExtraParams: () => ({}),
};

export const versionPageConfig = {
    service: versionService,
    columns: [
        { title: 'BOM版本号', dataIndex: 'version_code', sorter: true },
        { title: '所属物料编码', dataIndex: 'material_code', sorter: true },
        { title: '所属物料名称', dataIndex: 'material_name' },
        // --- 核心修改：在此处添加了“备注”列 ---
        { title: '备注', dataIndex: 'remark' },
        { title: '是否激活', dataIndex: 'is_active', render: (isActive) => (isActive ? '是' : '否'), ellipsis: false },
        { title: '创建时间', dataIndex: 'created_at', sorter: true, render: (text) => new Date(text).toLocaleString(), ellipsis: false },
    ],
    searchPlaceholder: '搜索BOM版本号或物料编码...',
    initialSorter: { field: 'created_at', order: 'descend' },
    getExtraParams: () => ({}),
};


// --- Recycle Bin Configurations ---

const createRecycleBinConfig = (service, columns, searchPlaceholder) => ({
    service,
    columns: [
        ...columns,
        { title: '删除时间', dataIndex: 'deleted_at', key: 'deleted_at', sorter: true, render: (text) => new Date(text).toLocaleString(), ellipsis: false }
    ],
    searchPlaceholder,
    initialSorter: { field: 'deleted_at', order: 'descend' },
    getExtraParams: () => ({ includeDeleted: true }),
});

export const recycleBinConfigs = {
    materials: createRecycleBinConfig(materialService, materialPageConfig.columns.slice(0, 2), '搜索已删除的物料...'),
    versions: createRecycleBinConfig(versionService, versionPageConfig.columns.slice(0, 3), '搜索已删除的BOM版本...'), // 修正：包含备注列
    suppliers: createRecycleBinConfig(supplierService, supplierPageConfig.columns.slice(0, 2), '搜索已删除的供应商...'),
    units: createRecycleBinConfig(unitService, unitPageConfig.columns, '搜索已删除的单位...'),
};