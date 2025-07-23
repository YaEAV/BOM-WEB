import React from 'react';
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
    // 一行代码，获取所有状态和业务逻辑函数
    const {
        state,
        dispatch,
        handleExportExcel,
        handleExportDrawings,
        handleVersionModalOk,
        handleDeleteVersion,
        handleLineModalOk,
        handleDeleteLines,
        refreshVersions,
        refreshBomLines,
    } = useBomManager(material, initialVersionId);

    // UI事件处理：展开全部
    const handleExpandAll = () => {
        const allKeys = getAllExpandableKeys(state.bomLines);
        dispatch({ type: 'SET_EXPANDED_ROWS', payload: allKeys });
    };

    // UI事件处理：折叠全部
    const handleCollapseAll = () => {
        dispatch({ type: 'SET_EXPANDED_ROWS', payload: [] });
    };

    // UI事件处理：打开“添加根BOM行”弹窗
    const handleAddRootLine = () => {
        dispatch({
            type: 'SHOW_LINE_MODAL',
            payload: {
                line: null,
                context: { versionId: state.selectedVersion.id, parentId: null }
            }
        });
    };

    // UI事件处理：打开“添加子BOM行”弹窗
    // --- 核心修改：重写 handleAddSubLine 的全部逻辑 ---
    const handleAddSubLine = () => {
        if (!state.selectedLineKeys || state.selectedLineKeys.length !== 1) {
            message.warn('请先选择一个物料行以添加子项。');
            return;
        }

        const parentLine = findLineByKey(state.bomLines, state.selectedLineKeys[0]);
        if (!parentLine) return; // 安全检查

        // 情况A: 该物料已是子装配，有自己的BOM版本
        if (parentLine.bom_version) {
            message.warn(`物料 "${parentLine.component_name}" 已是一个子装配，请到其自身的BOM中进行维护。`);
            return;
        }

        // 情况B: 该物料是一个零件，需要为它创建第一个BOM版本
        message.info(`正在为物料 "${parentLine.component_name}" 创建新的BOM版本...`);
        dispatch({
            type: 'SHOW_VERSION_MODAL',
            payload: {
                version: null, // 表示是新建
                isCopy: false,
                context: {
                    purpose: 'ADD_CHILD', // 特殊目的标记
                    targetMaterial: parentLine, // 将父行物料信息传递给弹窗
                }
            }
        });
    };

    // UI事件处理：打开“编辑BOM行”弹窗
    const handleEditLine = () => {
        const lineToEdit = findLineByKey(state.bomLines, state.selectedLineKeys[0]);
        if (lineToEdit) {
            dispatch({ type: 'SHOW_LINE_MODAL', payload: { line: lineToEdit, context: {} } });
        }
    };

        return (
        <>
            <Drawer
                title={<>BOM 管理: <Text strong>{material?.name}</Text> (<Text type="secondary">{material?.material_code}</Text>)</>}
                width={'85%'}
                onClose={onClose}
                open={visible}
                destroyOnClose
                styles={{
                    body: {
                        display: 'flex',
                        // --- 核心修改 #1: 从 'row' 改为 'column' ---
                        flexDirection: 'column',
                        padding: '16px',
                        gap: '16px',
                        backgroundColor: '#f5f5f5',
                        // 添加 overflow: hidden 防止抽屉出现双重滚动条
                        overflow: 'hidden'
                    }
                }}
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
                <Card
                    // --- 核心修改 #2: 移除 'marginLeft'，因为它现在是垂直布局 ---
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                    bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
                >
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

            {/* --- 核心修改：向 VersionModal 传递正确的物料信息 --- */}
            {state.versionModal.visible && (
                <VersionModal
                    visible={state.versionModal.visible}
                    onCancel={() => dispatch({ type: 'HIDE_MODALS' })}
                    onOk={(values) => handleVersionModalOk(values, state.versionModal.version, state.versionModal.isCopy)}
                    // 如果是从“添加子项”流程打开的，则使用子物料信息，否则使用顶层物料信息
                    targetMaterial={state.versionModal.context?.targetMaterial || material}
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
                    onOk={() => {
                        dispatch({ type: 'HIDE_MODALS' });
                        refreshBomLines();
                    }}
                    versionId={state.selectedVersion.id}
                />
            )}
        </>
    );
};

export default BomManagerDrawer;