// src/pages/RecycleBin.js (已修改)
import React, { useMemo } from 'react';
import { App as AntApp, Tabs } from 'antd';
import { UndoOutlined, DeleteOutlined } from '@ant-design/icons';
import GenericListPage from '../components/GenericListPage';
import { materialService } from '../services/materialService';
import { supplierService } from '../services/supplierService';
import { unitService } from '../services/unitService';
import { versionService } from '../services/versionService';

const { TabPane } = Tabs;

// --- 核心修改：将按钮配置拆分为独立的函数，并添加彻底删除按钮 ---

// 恢复按钮配置
const createRestoreButtonConfig = (service, entityName) => (selectedRows, refresh, handleAction) => ({
    text: `恢复${entityName}`,
    icon: <UndoOutlined />,
    type: 'primary',
    isConfirm: true,
    confirmTitle: `确定要恢复选中的 ${selectedRows.length} 项吗?`,
    onClick: () => handleAction(() => service.restore(selectedRows.map(r => r.id)), '恢复成功'),
    disabled: selectedRows.length === 0,
});

// 彻底删除按钮配置
const createPermanentDeleteButtonConfig = (service, entityName) => (selectedRows, refresh, handleAction) => ({
    text: `彻底删除`,
    icon: <DeleteOutlined />,
    danger: true,
    isConfirm: true,
    confirmTitle: `警告：此操作将永久删除 ${selectedRows.length} 项数据且无法恢复，确定吗？`,
    onClick: () => handleAction(() => service.deletePermanent(selectedRows.map(r => r.id)), '彻底删除成功'),
    disabled: selectedRows.length === 0,
});

const createPageConfig = (dataType, service, columns, searchPlaceholder) => ({
    service,
    columns: [
        ...columns,
        { title: '删除时间', dataIndex: 'deleted_at', key: 'deleted_at', sorter: true, showSorterTooltip: false, render: (text) => new Date(text).toLocaleString() }
    ],
    searchPlaceholder,
    initialSorter: { field: 'deleted_at', order: 'descend' },
    getExtraParams: () => ({ includeDeleted: true }),
    // 将多个按钮配置组合起来
    toolbarButtonsConfig: (selectedRows, refresh, handleAction) => ([
        ...(selectedRows.length > 0 ? [
            createRestoreButtonConfig(service, dataType)(selectedRows, refresh, handleAction),
            createPermanentDeleteButtonConfig(service, dataType)(selectedRows, refresh, handleAction)
        ] : [])
    ]),
    moreMenuItemsConfig: () => ([]),
    rowSelectionType: 'checkbox',
});

const RecycleBin = () => {
    const configs = useMemo(() => ({
        materials: createPageConfig('物料', materialService, [
            { title: '物料编码', dataIndex: 'material_code' },
            { title: '产品名称', dataIndex: 'name' },
        ], '搜索已删除的物料...'),
        versions: createPageConfig('BOM版本', versionService, [
            { title: 'BOM版本号', dataIndex: 'version_code' },
            { title: '所属物料编码', dataIndex: 'material_code' },
        ], '搜索已删除的BOM版本...'),
        suppliers: createPageConfig('供应商', supplierService, [
            { title: '供应商名称', dataIndex: 'name' },
            { title: '联系人', dataIndex: 'contact' },
        ], '搜索已删除的供应商...'),
        units: createPageConfig('单位', unitService, [
            { title: '单位名称', dataIndex: 'name' },
        ], '搜索已删除的单位...'),
    }), []);

    return (
        <div>
            <Tabs defaultActiveKey="materials">
                <TabPane tab="已删除的物料" key="materials"><GenericListPage {...configs.materials} /></TabPane>
                <TabPane tab="已删除的BOM版本" key="versions"><GenericListPage {...configs.versions} /></TabPane>
                <TabPane tab="已删除的供应商" key="suppliers"><GenericListPage {...configs.suppliers} /></TabPane>
                <TabPane tab="已删除的单位" key="units"><GenericListPage {...configs.units} /></TabPane>
            </Tabs>
        </div>
    );
};

export default RecycleBin;