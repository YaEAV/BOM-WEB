// src/hooks/useModalManager.js (新建文件)
import { useState, useCallback } from 'react';
import { Form, message as antdMessage } from 'antd';

export const useModalManager = (service) => {
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [form] = Form.useForm();

    const [refreshCallback, setRefreshCallback] = useState(() => () => {});

    const showModal = useCallback((item = null, refreshFn = null) => {
        setEditingItem(item);
        form.setFieldsValue(item || {});
        setIsModalVisible(true);
        if (refreshFn) {
            setRefreshCallback(() => refreshFn);
        }
    }, [form]);

    const handleCancel = useCallback(() => {
        setIsModalVisible(false);
        setEditingItem(null);
        form.resetFields();
    }, [form]);

    const handleOk = useCallback(async () => {
        try {
            const values = await form.validateFields();
            if (editingItem && editingItem.id) {
                await service.update(editingItem.id, values);
            } else {
                await service.create(values);
            }
            antdMessage.success('操作成功');
            handleCancel();
            if (refreshCallback) {
                refreshCallback();
            }
        } catch (error) {
            console.log('Operation failed:', error);
            // 全局错误拦截器会显示消息
        }
    }, [form, editingItem, service, handleCancel, refreshCallback]);

    return {
        isModalVisible,
        editingItem,
        form,
        showModal,
        handleCancel,
        handleOk,
    };
};