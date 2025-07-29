// src/pages/BomManagerDrawer.js (最终功能增强版)
import React, { useState } from 'react';
import { Drawer, Card, Typography, message } from 'antd';

import { useBomManager } from '../hooks/useBomManager';
import { getAllExpandableKeys, findLineByKey } from '../utils/bomUtils';

import VersionPanel from '../components/bom/VersionPanel';
import BomToolbar from '../components/bom/BomToolbar';
import BomTable from '../components/bom/BomTable';
import VersionModal from '../components/VersionModal';
import BomLineModal from '../components/BomLineModal';
import BomImportModal from '../components/bom/BomImportModal';

const { Text } = Typography;

const BomManagerDrawer = ({ visible, onClose, material, initialVersionId = null }) => {
    // 嵌套抽屉的状态
    const [nestedDrawerProps, setNestedDrawerProps] = useState({ visible: false, material: null });

    // 为当前抽屉获取所有状态和业务逻辑函数
    const {
        state,
        dispatch,
        handleExportExcel,
        handleExportDrawings,
        handleVersionModalOk,
        handleDeleteVersion,
        handleLineModalOk,
        handleDeleteLines,
        refreshBomLines,
        refreshVersions,
    } = useBomManager(material, initialVersionId);

    // 关闭嵌套的BOM管理抽屉
    const closeNestedDrawer = () => {
        setNestedDrawerProps({ visible: false, material: null });
        // 【修改】调用刷新时传入选项，告诉它要保留父级页面的选中状态
        refreshBomLines({ preserveSelection: true });
    };

    // 处理 "添加子项" 工具栏按钮点击
    const handleAddSubLine = () => {
        if (!state.selectedLineKeys || state.selectedLineKeys.length !== 1) {
            message.warn('请先选择一个物料行以添加子项。');
            return;
        }
        const parentLine = findLineByKey(state.bomLines, state.selectedLineKeys[0]);
        if (!parentLine) return;

        setNestedDrawerProps({
            visible: true,
            material: {
                id: parentLine.component_id,
                name: parentLine.component_name,
                material_code: parentLine.component_code,
            },
        });
    };

    // UI事件处理
    const handleExpandAll = () => dispatch({ type: 'SET_EXPANDED_ROWS', payload: getAllExpandableKeys(state.bomLines) });
    const handleCollapseAll = () => dispatch({ type: 'SET_EXPANDED_ROWS', payload: [] });
    const handleAddRootLine = () => {
        if (!state.selectedVersion) {
            message.warn("请先选择或创建一个BOM版本。");
            return;
        }
        dispatch({ type: 'SHOW_LINE_MODAL', payload: { line: null, context: { versionId: state.selectedVersion.id, parentId: null } } });
    }
    const handleEditLine = () => {
        const lineToEdit = findLineByKey(state.bomLines, state.selectedLineKeys[0]);
        if (lineToEdit) dispatch({ type: 'SHOW_LINE_MODAL', payload: { line: lineToEdit, context: {} } });
    };

    return (
        <>
            <Drawer
                title={<>BOM 管理: <Text strong>{material?.name}</Text> (<Text type="secondary">{material?.material_code}</Text>)</>}
                width={'85%'}
                onClose={onClose}
                open={visible}
                destroyOnClose
                styles={{ body: { display: 'flex', flexDirection: 'column', padding: '16px', gap: '16px', backgroundColor: '#f5f5f5', overflow: 'hidden' } }}
            >
                <VersionPanel
                    versions={state.versions}
                    loading={state.loading.versions}
                    material={material}
                    selectedVersion={state.selectedVersion}
                    onVersionSelect={(v) => dispatch({ type: 'SET_SELECTED_VERSION', payload: v })}
                    onAddVersion={() => dispatch({ type: 'SHOW_VERSION_MODAL', payload: { version: null, isCopy: false } })}
                    onEditVersion={(v) => dispatch({ type: 'SHOW_VERSION_MODAL', payload: { version: v, isCopy: false } })}
                    onCopyVersion={(v) => dispatch({ type: 'SHOW_VERSION_MODAL', payload: { version: v, isCopy: true } })}
                    onDeleteVersion={handleDeleteVersion}
                    onActivateVersion={refreshVersions}
                />
                <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
                    <BomToolbar
                        selectedVersion={state.selectedVersion}
                        selectedLineKeys={state.selectedLineKeys}
                        onAddRootLine={handleAddRootLine}
                        onEditLine={handleEditLine}
                        onAddSubLine={handleAddSubLine}
                        onDeleteLines={handleDeleteLines}
                        onImport={() => dispatch({ type: 'SHOW_IMPORT_MODAL' })}
                        onExpandAll={handleExpandAll}
                        onCollapseAll={handleCollapseAll}
                        onExportExcel={handleExportExcel}
                        onExportDrawings={handleExportDrawings}
                        isExportingExcel={state.loading.exportingExcel}
                        isExportingDrawings={state.loading.exportingDrawings}
                    />
                    <BomTable
                        loading={state.loading.bom}
                        bomLines={state.bomLines}
                        selectedLineKeys={state.selectedLineKeys}
                        onSelectionChange={(keys) => dispatch({ type: 'SET_SELECTED_LINES', payload: keys })}
                        expandedRowKeys={state.expandedRowKeys}
                        onExpandedRowsChange={(keys) => dispatch({ type: 'SET_EXPANDED_ROWS', payload: keys })}
                    />
                </Card>
            </Drawer>

            {/* 渲染嵌套的抽屉 */}
            {nestedDrawerProps.visible && (
                <BomManagerDrawer
                    visible={nestedDrawerProps.visible}
                    material={nestedDrawerProps.material}
                    onClose={closeNestedDrawer}
                />
            )}

            {/* 渲染模态框 */}
            {state.versionModal.visible && (
                <VersionModal
                    visible={state.versionModal.visible}
                    onCancel={() => dispatch({ type: 'HIDE_MODALS' })}
                    onOk={(values, v, isCopy) => handleVersionModalOk(values, v, isCopy)}
                    targetMaterial={material}
                    editingVersion={state.versionModal.version}
                    isCopyMode={state.versionModal.isCopy}
                />
            )}

            {state.lineModal.visible && (
                <BomLineModal
                    visible={state.lineModal.visible}
                    onCancel={() => dispatch({ type: 'HIDE_MODALS' })}
                    onOk={handleLineModalOk}
                    editingLine={state.lineModal.line}
                />
            )}

            {state.importModalVisible && state.selectedVersion && (
                <BomImportModal
                    visible={state.importModalVisible}
                    onCancel={() => dispatch({ type: 'HIDE_MODALS' })}
                    onOk={() => { dispatch({ type: 'HIDE_MODALS' }); refreshBomLines(); }}
                    versionId={state.selectedVersion.id}
                />
            )}
        </>
    );
};

export default BomManagerDrawer;