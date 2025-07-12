// src/context/AppContext.js
import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { Spin } from 'antd';
import { supplierService } from '../services/supplierService';
import { unitService } from '../services/unitService';

const AppContext = createContext();

export const useAppData = () => {
    return useContext(AppContext);
};

export const AppProvider = ({ children }) => {
    const [suppliers, setSuppliers] = useState([]);
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- 核心修改：将获取数据的逻辑封装到 useCallback 中 ---
    const fetchData = useCallback(async () => {
        try {
            setLoading(true); // 开始获取数据时，设置为加载状态
            const [suppliersRes, unitsRes] = await Promise.all([
                supplierService.get({ limit: 10000, sortBy: 'name', sortOrder: 'asc' }),
                unitService.get({ limit: 10000, sortBy: 'name', sortOrder: 'asc' })
            ]);
            setSuppliers(suppliersRes.data.data || []);
            setUnits(unitsRes.data.data || []);
        } catch (error) {
            console.error("Failed to fetch initial app data", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <Spin size="large" tip="正在加载基础数据..." />
            </div>
        );
    }

    const value = {
        suppliers,
        units,
        // --- 核心修改：将 fetchData 函数作为 refetchData 提供给所有子组件 ---
        refetchData: fetchData,
    };

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
};