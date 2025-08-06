// src/components/bom/BomToolbar.js (已重构)
import React from 'react';
import { Button, Space, Tooltip, Popconfirm, Dropdown, Menu } from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    FileAddOutlined,
    FolderViewOutlined,
    UploadOutlined,
    FileExcelOutlined,
    PictureOutlined,
    DownOutlined,
    RightOutlined,
    EllipsisOutlined, // 用于“更多操作”按钮
} from '@ant-design/icons';

const BomToolbar = ({
                        selectedVersion,
                        selectedLineKeys,
                        onAddRootLine,
                        onEditLine,
                        onAddSubLine,
                        onShowDrawings,
                        onDeleteLines,
                        onImport,
                        onExpandAll,
                        onCollapseAll,
                        onExportExcel,
                        onExportDrawings,
                        isExportingExcel,
                        isExportingDrawings,
                    }) => {

    const hasVersion = !!selectedVersion;
    const singleSelected = selectedLineKeys.length === 1;
    const multipleSelected = selectedLineKeys.length > 0;

    // --- 【新增】为折叠按钮创建菜单 ---
    const moreActionsMenu = (
        <Menu>
            <Menu.Item key="import" icon={<UploadOutlined />} onClick={onImport} disabled={!hasVersion}>
                导入BOM
            </Menu.Item>
            <Menu.Item key="exportExcel" icon={<FileExcelOutlined />} onClick={onExportExcel} loading={isExportingExcel} disabled={!hasVersion}>
                导出清单
            </Menu.Item>
            <Menu.Item key="exportDrawings" icon={<PictureOutlined />} onClick={onExportDrawings} loading={isExportingDrawings} disabled={!hasVersion}>
                导出图纸包
            </Menu.Item>
        </Menu>
    );

    return (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', backgroundColor: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* --- 【修改】左侧按钮和提示信息 --- */}
            <Space>
                <Tooltip title="展开所有层级">
                    <Button icon={<DownOutlined />} onClick={onExpandAll} disabled={!hasVersion} />
                </Tooltip>
                <Tooltip title="折叠所有层级">
                    <Button icon={<RightOutlined />} onClick={onCollapseAll} disabled={!hasVersion} />
                </Tooltip>
                {multipleSelected && (
                    <span style={{ marginLeft: '16px', color: '#888' }}>
                        已选择 {selectedLineKeys.length} 项
                    </span>
                )}
            </Space>

            {/* --- 【修改】右侧主要操作按钮 --- */}
            <Space>
                <Tooltip title="为当前BOM版本添加一个根物料行">
                    <Button icon={<PlusOutlined />} onClick={onAddRootLine} disabled={!hasVersion}>
                        添加根行
                    </Button>
                </Tooltip>
                <Tooltip title="为选中的物料行添加一个子物料">
                    <Button icon={<FileAddOutlined />} onClick={onAddSubLine} disabled={!singleSelected}>
                        添加子项
                    </Button>
                </Tooltip>
                <Tooltip title="编辑选中的物料行">
                    <Button icon={<EditOutlined />} onClick={onEditLine} disabled={!singleSelected}>
                        编辑
                    </Button>
                </Tooltip>
                <Tooltip title="查看选中物料的图纸">
                    <Button icon={<FolderViewOutlined />} onClick={onShowDrawings} disabled={!singleSelected}>
                        查看图纸
                    </Button>
                </Tooltip>
                <Popconfirm
                    title={`确定要删除选中的 ${selectedLineKeys.length} 个物料行吗？`}
                    onConfirm={onDeleteLines}
                    disabled={!multipleSelected}
                    okText="确定"
                    cancelText="取消"
                >
                    <Tooltip title="删除选中的一行或多行">
                        <Button icon={<DeleteOutlined />} disabled={!multipleSelected} danger>
                            删除
                        </Button>
                    </Tooltip>
                </Popconfirm>

                {/* --- 【修改】折叠后的“更多操作”按钮 --- */}
                <Dropdown overlay={moreActionsMenu} placement="bottomRight">
                    <Button icon={<EllipsisOutlined />} />
                </Dropdown>
            </Space>
        </div>
    );
};

export default BomToolbar;