// src/pages/UnitList.js
import React, { useState } from 'react';
import { Modal, Form, Input } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import GenericListPage from '../components/GenericListPage';
import { unitService } from '../services/unitService';
import { useModalManager } from '../hooks/useModalManager';

const UnitList = () => {
    const { isModalVisible, editingItem, form, showModal, handleCancel, handleOk } = useModalManager(unitService);
    const [refreshKey, setRefreshKey] = useState(0);
    const refresh = () => setRefreshKey(k => k + 1);

    const pageConfig = {
        service: unitService,
        columns: [ { title: '单位名称', dataIndex: 'name', sorter: true } ],
        searchPlaceholder: '搜索单位名称...',
        initialSorter: { field: 'name', order: 'ascend' },
        toolbarButtonsConfig: (selectedRows, refreshFn, handleAction) => ([
            ...(selectedRows.length > 0 ? [
                { text: '编辑', icon: <EditOutlined />, onClick: () => showModal(selectedRows[0]), disabled: selectedRows.length !== 1 },
                { text: '移至回收站', icon: <DeleteOutlined />, danger: true, isConfirm: true, confirmTitle: `确定删除选中的 ${selectedRows.length} 项吗?`,
                    onClick: () => handleAction(() => unitService.delete(selectedRows.map(r => r.id)), '删除成功'),
                    disabled: selectedRows.length === 0 },
            ] : []),
            { text: '新增单位', icon: <PlusOutlined />, type: 'primary', onClick: () => showModal() },
        ]),
        moreMenuItemsConfig: () => ([]),
    };

    return (
        <>
            <GenericListPage {...pageConfig} refreshKey={refreshKey} />
            <Modal
                title={editingItem ? '编辑单位' : '新增单位'}
                open={isModalVisible}
                onOk={() => handleOk(refresh)} // --- 核心修改：将列表刷新函数传给handleOk
                onCancel={handleCancel}
                destroyOnClose >
                <Form form={form} layout="vertical" name="unitForm">
                    <Form.Item name="name" label="单位名称" rules={[{ required: true, message: '请输入单位名称!' }]}><Input /></Form.Item>
                </Form>
            </Modal>
        </>
    );
};
export default UnitList;