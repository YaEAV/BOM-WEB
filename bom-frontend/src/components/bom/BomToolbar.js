// src/components/bom/BomToolbar.js (最终修正版 - 支持展开/折叠)
import React from 'react';
import { Button, Space, Typography, Popconfirm } from 'antd';
import { PlusOutlined, UploadOutlined, DownloadOutlined, FileZipOutlined, EditOutlined, DeleteOutlined, ExpandAltOutlined, CompressOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const BomToolbar = ({
                        selectedVersion,
                        selectedLineKeys,
                        onAddRootLine,
                        onImport,
                        onExportExcel,
                        onExportDrawings,
                        onEditLine,
                        onDeleteLines,
                        onAddSubLine,
                        onExpandAll,      // <--- 新增
                        onCollapseAll,  // <--- 新增
                        exporting,
                        exportingBOM
                    }) => {
    const singleSelected = selectedLineKeys.length === 1;

    return (
        <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Title level={5} style={{ margin: 0 }}>BOM 结构 (版本: {selectedVersion?.version_code || 'N/A'})</Title>
                <Space>
                    {/* --- 新增的展开/折叠按钮 --- */}
                    <Button size="small" onClick={onExpandAll} icon={<ExpandAltOutlined />} disabled={!selectedVersion}>全部展开</Button>
                    <Button size="small" onClick={onCollapseAll} icon={<CompressOutlined />} disabled={!selectedVersion}>全部折叠</Button>
                    <Button size="small" onClick={onAddRootLine} type="primary" icon={<PlusOutlined />} disabled={!selectedVersion}>添加根物料</Button>
                    <Button size="small" onClick={onImport} icon={<UploadOutlined />} disabled={!selectedVersion}>导入</Button>
                    <Button size="small" onClick={onExportExcel} icon={<DownloadOutlined />} disabled={!selectedVersion} loading={exporting}>导出</Button>
                    <Button size="small" onClick={onExportDrawings} icon={<FileZipOutlined />} disabled={!selectedVersion} loading={exportingBOM}>导出图纸</Button>
                </Space>
            </div>
            <div style={{ minHeight: '32px', display: 'flex', alignItems: 'center', marginTop: '8px' }}>
                {selectedLineKeys.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <Text strong>已选择 {selectedLineKeys.length} 项</Text>
                        <Space>
                            <Button size="small" icon={<EditOutlined />} disabled={!singleSelected} onClick={onEditLine}>编辑</Button>
                            <Button size="small" disabled={!singleSelected} onClick={onAddSubLine}>添加子项</Button>
                            <Popconfirm title="确定删除选中的行吗? (若有子项将无法删除)" onConfirm={onDeleteLines} disabled={selectedLineKeys.length === 0}>
                                <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                            </Popconfirm>
                        </Space>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BomToolbar;