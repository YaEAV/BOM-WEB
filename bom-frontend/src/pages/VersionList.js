// src/pages/VersionList.js (Corrected)
import React, { useState } from 'react';
import { App as AntApp } from 'antd';
import { AppstoreOutlined, DeleteOutlined } from '@ant-design/icons';
import GenericListPage from '../components/GenericListPage';
import { versionService } from '../services/versionService';
import { versionPageConfig } from '../config/pageConfigs';
import BomManagerDrawer from './BomManagerDrawer';

const VersionList = () => {
    const { message } = AntApp.useApp();
    const [drawerState, setDrawerState] = useState({ visible: false, material: null, versionId: null });

    const showBomManager = (record) => {
        setDrawerState({ visible: true, material: { id: record.material_id, name: record.material_name, material_code: record.material_code }, versionId: record.id });
    };

    const handleAction = async (actionFn, successMsg, refreshFn) => {
        try {
            await actionFn();
            if(successMsg) message.success(successMsg);
            refreshFn();
        } catch (error) {}
    };

    const toolbarButtonsConfig = (selectedRows, refresh) => {
        const singleSelected = selectedRows.length === 1;
        return [
            { text: '查看BOM', icon: <AppstoreOutlined />, onClick: () => showBomManager(selectedRows[0]), disabled: !singleSelected },
            { text: '移至回收站', icon: <DeleteOutlined />, danger: true, isConfirm: true, confirmTitle: `确定删除选中的 ${selectedRows.length} 项吗?`,
                onClick: () => handleAction(() => versionService.delete(selectedRows.map(r => r.id)), '删除成功', refresh), disabled: selectedRows.length === 0 }
        ];
    };

    return (
        <>
            <GenericListPage
                {...versionPageConfig}
                toolbarButtonsConfig={toolbarButtonsConfig}
                moreMenuItemsConfig={() => []} // Explicitly provide empty config
            />
            {drawerState.visible && (
                <BomManagerDrawer
                    visible={drawerState.visible}
                    onClose={() => setDrawerState({ visible: false, material: null, versionId: null })}
                    material={drawerState.material}
                    initialVersionId={drawerState.versionId}
                />
            )}
        </>
    );
};

export default VersionList;