// src/pages/BomManagerDrawer.js (已恢复您的原始逻辑，仅修复布局)
import React, { useState, useEffect } from 'react';
import { Drawer, Card, Typography, message } from 'antd';

import { useBomManager } from '../hooks/useBomManager';
import { getAllExpandableKeys, findLineByKey } from '../utils/bomUtils';

import VersionPanel from '../components/bom/VersionPanel';
import BomToolbar from '../components/bom/BomToolbar';
import BomTable from '../components/bom/BomTable';
import VersionModal from '../components/VersionModal';
import BomLineModal from '../components/BomLineModal';
import BomImportModal from '../components/bom/BomImportModal';
import DrawingManagerDrawer from './DrawingManagerDrawer';

const { Text } = Typography;

const BomManagerDrawer = ({ visible, onClose, material, initialVersionId = null }) => {
    const [nestedDrawerProps, setNestedDrawerProps] = useState({ visible: false, material: null });
    const [drawingDrawerState, setDrawingDrawerState] = useState({ visible: false, material: null });

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

    const closeNestedDrawer = () => {
        setNestedDrawerProps({ visible: false, material: null });
        refreshBomLines({ preserveSelection: true });
    };

    const handleShowDrawings = () => {
        if (!state.selectedLineKeys || state.selectedLineKeys.length !== 1) {
            message.warn('请先选择一个物料行以查看其图纸。');
            return;
        }
        const selectedLine = findLineByKey(state.bomLines, state.selectedLineKeys[0]);
        if (!selectedLine) {
            message.error('找不到选中的物料行。');
            return;
        }
        setDrawingDrawerState({
            visible: true,
            material: {
                id: selectedLine.component_id,
                name: selectedLine.component_name,
                material_code: selectedLine.component_code,
            },
        });
    };

    const handleCloseDrawings = () => {
        setDrawingDrawerState({ visible: false, material: null });
    };

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
                // --- 核心修改 #1: 让抽屉内容区成为一个Flex容器 ---
                styles={{ body: { display: 'flex', flexDirection: 'column', padding: '16px', gap: '16px', backgroundColor: '#f5f5f5' } }}
            >
                {/* VersionPanel保持不变，它将作为Flex布局的第一个固定高度的子元素 */}
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

                {/* --- 核心修改 #2: 让Card（表格的容器）自动伸展以填满所有剩余空间 --- */}
                <Card
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                    bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
                >
                    <BomToolbar
                        selectedVersion={state.selectedVersion}
                        selectedLineKeys={state.selectedLineKeys}
                        onAddRootLine={handleAddRootLine}
                        onEditLine={handleEditLine}
                        onAddSubLine={handleAddSubLine}
                        onShowDrawings={handleShowDrawings}
                        onDeleteLines={handleDeleteLines}
                        onImport={() => dispatch({ type: 'SHOW_IMPORT_MODAL' })}
                        onExpandAll={handleExpandAll}
                        onCollapseAll={handleCollapseAll}
                        onExportExcel={handleExportExcel}
                        onExportDrawings={handleExportDrawings}
                        isExportingExcel={state.loading.exportingExcel}
                        isExportingDrawings={state.loading.exportingDrawings}
                    />

                    {/* --- 核心修改 #3: 这个div将作为表格的直接父容器，并自动填充Card内的剩余空间 --- */}
                    <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
                        <BomTable
                            loading={state.loading.bom}
                            bomLines={state.bomLines}
                            selectedLineKeys={state.selectedLineKeys}
                            onSelectionChange={(keys) => dispatch({ type: 'SET_SELECTED_LINES', payload: keys })}
                            expandedRowKeys={state.expandedRowKeys}
                            onExpandedRowsChange={(keys) => dispatch({ type: 'SET_EXPANDED_ROWS', payload: keys })}
                        />
                    </div>
                </Card>
            </Drawer>

            {/* 其他的抽屉和模态框保持不变 */}
            {nestedDrawerProps.visible && (
                <BomManagerDrawer
                    visible={nestedDrawerProps.visible}
                    material={nestedDrawerProps.material}
                    onClose={closeNestedDrawer}
                />
            )}
            {drawingDrawerState.visible && (
                <DrawingManagerDrawer
                    visible={drawingDrawerState.visible}
                    material={drawingDrawerState.material}
                    onClose={handleCloseDrawings}
                />
            )}
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