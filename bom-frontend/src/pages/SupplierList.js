// src/pages/SupplierList.js
import React, { useState } from 'react';
import { Modal, Form, Input } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import GenericListPage from '../components/GenericListPage';
import { supplierService } from '../services/supplierService';
import { useModalManager } from '../hooks/useModalManager';

const SupplierList = () => {
    const { isModalVisible, editingItem, form, showModal, handleCancel, handleOk } = useModalManager(supplierService);
    const [refreshKey, setRefreshKey] = useState(0);
    const refresh = () => setRefreshKey(k => k + 1);

    const pageConfig = {
        service: supplierService,
        columns: [
            { title: '供应商名称', dataIndex: 'name', sorter: true },
            { title: '联系人', dataIndex: 'contact' },
            { title: '电话', dataIndex: 'phone' },
            { title: '地址', dataIndex: 'address', width: 300 },
            { title: '备注', dataIndex: 'remark' },
        ],
        searchPlaceholder: '搜索供应商名称或联系人...',
        initialSorter: { field: 'name', order: 'ascend' },
        toolbarButtonsConfig: (selectedRows, refreshFn, handleAction) => ([
            ...(selectedRows.length > 0 ? [
                { text: '编辑', icon: <EditOutlined />, onClick: () => showModal(selectedRows[0]), disabled: selectedRows.length !== 1 },
                { text: '移至回收站', icon: <DeleteOutlined />, danger: true, isConfirm: true, confirmTitle: `确定删除选中的 ${selectedRows.length} 项吗?`,
                    onClick: () => handleAction(() => supplierService.delete(selectedRows.map(r => r.id)), '删除成功'),
                    disabled: selectedRows.length === 0 },
            ] : []),
            { text: '新增供应商', icon: <PlusOutlined />, type: 'primary', onClick: () => showModal() },
        ]),
        moreMenuItemsConfig: () => ([]),
    };

    return (
        <>
            <GenericListPage {...pageConfig} refreshKey={refreshKey} />
            <Modal
                title={editingItem ? '编辑供应商' : '新增供应商'}
                open={isModalVisible}
                onOk={() => handleOk(refresh)} // --- 核心修改：将列表刷新函数传给handleOk
                onCancel={handleCancel}
                destroyOnClose
            >
                <Form form={form} layout="vertical" name="supplierForm">
                    <Form.Item name="name" label="供应商名称" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="contact" label="联系人"><Input /></Form.Item>
                    <Form.Item name="phone" label="电话"><Input /></Form.Item>
                    <Form.Item name="address" label="地址"><Input.TextArea /></Form.Item>
                    <Form.Item name="remark" label="备注"><Input.TextArea /></Form.Item>
                </Form>
            </Modal>
        </>
    );
};

export default SupplierList;