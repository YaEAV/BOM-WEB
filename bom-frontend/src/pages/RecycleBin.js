// src/pages/RecycleBin.js (已添加BOM行回收站)
import React, { useMemo } from 'react';
import { Tabs, message } from 'antd'; // 1. 修正 antd 的导入
import { UndoOutlined, DeleteOutlined } from '@ant-design/icons';
import GenericListPage from '../components/GenericListPage';
import { materialService } from '../services/materialService';
import { supplierService } from '../services/supplierService';
import { unitService } from '../services/unitService';
import { versionService } from '../services/versionService';
import { lineService } from '../services/lineService'; // 1. 引入 lineService

const { TabPane } = Tabs;

const createRestoreButtonConfig = (service, entityName) => (selectedRows, refresh, handleAction) => ({
    text: `恢复${entityName}`,
    icon: <UndoOutlined />,
    type: 'primary',
    isConfirm: true,
    confirmTitle: `确定要恢复选中的 ${selectedRows.length} 项吗?`,
    onClick: () => handleAction(() => service.restore(selectedRows.map(r => r.id)), '恢复成功'),
    disabled: selectedRows.length === 0,
});

const createPermanentDeleteButtonConfig = (service, entityName) => (selectedRows, refresh, handleAction) => ({
    text: `彻底删除`,
    icon: <DeleteOutlined />,
    danger: true,
    isConfirm: true,
    confirmTitle: `警告：此操作将永久删除 ${selectedRows.length} 项数据及其所有子项（如果适用）且无法恢复，确定吗？`,
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
    // 2. 定义统一的事件处理函数，直接使用静态 message 对象
    const handleAction = async (actionFn, successMsg, refreshFn) => {
        try {
            await actionFn();
            message.success(successMsg);
            refreshFn();
        } catch (error) {
            // 错误消息将由全局的请求拦截器自动处理
        }
    };
    const configs = useMemo(() => ({
        materials: createPageConfig('物料', materialService, [
            { title: '物料编码', dataIndex: 'material_code' },
            { title: '产品名称', dataIndex: 'name' },
        ], '搜索已删除的物料...'),
        versions: createPageConfig('BOM版本', versionService, [
            { title: 'BOM版本号', dataIndex: 'version_code' },
            { title: '所属物料编码', dataIndex: 'material_code' },
        ], '搜索已删除的BOM版本...'),
        // 2. 添加BOM行的配置
        lines: createPageConfig('BOM行', lineService, [
            { title: '所属BOM版本', dataIndex: 'version_code', sorter: true },
            { title: '父项编码', dataIndex: 'parent_component_code', render: (text) => text || '— (顶层)' },
            { title: '父项名称', dataIndex: 'parent_component_name' },
            { title: '位置编号', dataIndex: 'position_code' },
            { title: '子件编码', dataIndex: 'component_code', sorter: true },
            { title: '子件名称', dataIndex: 'component_name' },
            { title: '用量', dataIndex: 'quantity' },
        ], '搜索已删除的BOM行...'),
        suppliers: createPageConfig('供应商', supplierService, [
            { title: '供应商名称', dataIndex: 'name' },
            { title: '联系人', dataIndex: 'contact' },
        ], '搜索已删除的供应商...'),
        units: createPageConfig('单位', unitService, [
            { title: '单位名称', dataIndex: 'name' },
        ], '搜索已删除的单位...'),
    }), []);

    // 3. 将 handleAction 传递给列表组件
    const getPageConfig = (baseConfig) => ({
        ...baseConfig,
        toolbarButtonsConfig: (selectedRows, refresh) =>
            baseConfig.toolbarButtonsConfig(selectedRows, refresh, (actionFn, msg) => handleAction(actionFn, msg, refresh))
    });

    return (
        <div>
            <Tabs defaultActiveKey="materials">
                <TabPane tab="已删除的物料" key="materials"><GenericListPage {...getPageConfig(configs.materials)} /></TabPane>
                <TabPane tab="已删除的BOM版本" key="versions"><GenericListPage {...getPageConfig(configs.versions)} /></TabPane>
                <TabPane tab="已删除的BOM行" key="lines"><GenericListPage {...getPageConfig(configs.lines)} /></TabPane>
                <TabPane tab="已删除的供应商" key="suppliers"><GenericListPage {...getPageConfig(configs.suppliers)} /></TabPane>
                <TabPane tab="已删除的单位" key="units"><GenericListPage {...getPageConfig(configs.units)} /></TabPane>
            </Tabs>
        </div>
    );
};

export default RecycleBin;