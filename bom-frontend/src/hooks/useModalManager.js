// src/hooks/useModalManager.js
import { useState, useCallback } from 'react';
import { Form, message as antdMessage } from 'antd';
import { useAppData } from '../context/AppContext'; // 引入 useAppData

export const useModalManager = (service) => {
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [form] = Form.useForm();
    const { refetchData } = useAppData(); // 获取全局刷新函数

    const showModal = useCallback((item = null, refreshFn) => {
        // 这个 refreshFn 现在可以废弃了，因为我们有了全局刷新
        setEditingItem(item);
        form.setFieldsValue(item || {});
        setIsModalVisible(true);
    }, [form]);

    const handleCancel = useCallback(() => {
        setIsModalVisible(false);
        setEditingItem(null);
        form.resetFields();
    }, [form]);

    const handleOk = useCallback(async (listRefreshFn) => {
        try {
            const values = await form.validateFields();
            if (editingItem && editingItem.id) {
                await service.update(editingItem.id, values);
            } else {
                await service.create(values);
            }
            antdMessage.success('操作成功');
            handleCancel();

            // --- 核心修改：调用全局和局部的刷新函数 ---
            if (refetchData) {
                refetchData(); // 刷新全局数据 (供应商、单位)
            }
            if (listRefreshFn) {
                listRefreshFn(); // 刷新当前列表
            }

        } catch (error) {
            console.log('Operation failed:', error);
        }
    }, [form, editingItem, service, handleCancel, refetchData]);

    return {
        isModalVisible,
        editingItem,
        form,
        showModal,
        handleCancel,
        handleOk,
    };
};