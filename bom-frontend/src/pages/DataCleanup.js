// src/pages/DataCleanup.js (新建文件)
import React from 'react';
import { App as AntApp, Tabs } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import GenericListPage from '../components/GenericListPage';
import { cleanupService } from '../services/cleanupService';
import { materialService } from '../services/materialService';
import { versionService } from '../services/versionService';
import { drawingService } from '../services/drawingService';

const { TabPane } = Tabs;

// --- 核心修改：确保调用正确的 deletePermanent 方法 ---
const createDeleteButtonConfig = (service, entityName, isDrawing = false) => (selectedRows, refresh, handleAction) => ([
    {
        text: `永久删除选中的${entityName}`,
        icon: <DeleteOutlined />,
        danger: true,
        isConfirm: true,
        confirmTitle: `确定要永久删除选中的 ${selectedRows.length} 项吗? 这个操作不可恢复！`,
        onClick: () => {
            const ids = selectedRows.map(r => r.id);
            let deleteAction;
            if (isDrawing) {
                deleteAction = drawingService.deleteBatch(ids);
            } else {
                // 确保调用 deletePermanent
                deleteAction = service.deletePermanent(ids);
            }
            handleAction(() => deleteAction, '删除成功');
        },
        disabled: selectedRows.length === 0,
    }
]);

const emptyBomVersionsConfig = {
    service: { get: (params) => cleanupService.getEmptyBomVersions(params) },
    columns: [
        { title: 'BOM版本号', dataIndex: 'version_code', sorter: false },
        { title: '所属物料编码', dataIndex: 'material_code' },
        { title: '所属物料名称', dataIndex: 'material_name' },
    ],
    searchPlaceholder: '此列表不支持搜索',
    toolbarButtonsConfig: createDeleteButtonConfig(versionService, 'BOM版本'),
    moreMenuItemsConfig: () => ([]),
};

const unusedMaterialsConfig = {
    service: { get: (params) => cleanupService.getUnusedMaterials(params) },
    columns: [
        { title: '物料编码', dataIndex: 'material_code' },
        { title: '产品名称', dataIndex: 'name' },
        { title: '物料属性', dataIndex: 'category' },
    ],
    searchPlaceholder: '此列表不支持搜索',
    toolbarButtonsConfig: createDeleteButtonConfig(materialService, '物料'),
    moreMenuItemsConfig: () => ([]),
};

const orphanedDrawingsConfig = {
    service: { get: (params) => cleanupService.getOrphanedDrawings(params) },
    columns: [
        { title: '图纸文件名', dataIndex: 'file_name' },
        { title: '图纸版本', dataIndex: 'drawing_version' },
        { title: '所属物料编码 (已删除)', dataIndex: 'material_code' },
    ],
    searchPlaceholder: '此列表不支持搜索',
    toolbarButtonsConfig: createDeleteButtonConfig(drawingService, '图纸', true),
    moreMenuItemsConfig: () => ([]),
};

const DataCleanup = () => {
    const { message } = AntApp.useApp();
    const handleAction = async (actionFn, successMsg, refresh) => {
        try {
            await actionFn();
            if(successMsg) message.success(successMsg);
            if(refresh) refresh();
        } catch (error) {
            // 全局拦截器处理
        }
    };

    // 为每个列表重新创建配置，并传入正确的 handleAction
    const getPageConfig = (baseConfig) => ({
        ...baseConfig,
        toolbarButtonsConfig: (selectedRows, refresh) =>
            baseConfig.toolbarButtonsConfig(selectedRows, refresh, (actionFn, msg) => handleAction(actionFn, msg, refresh))
    });

    return (
        <div>
            <Tabs defaultActiveKey="emptyBoms">
                <TabPane tab="空的BOM版本" key="emptyBoms">
                    <GenericListPage {...getPageConfig(emptyBomVersionsConfig)} />
                </TabPane>
                <TabPane tab="未使用的物料" key="unusedMaterials">
                    <GenericListPage {...getPageConfig(unusedMaterialsConfig)} />
                </TabPane>
                <TabPane tab="孤立的图纸" key="orphanedDrawings">
                    <GenericListPage {...getPageConfig(orphanedDrawingsConfig)} />
                </TabPane>
            </Tabs>
        </div>
    );
};

export default DataCleanup;