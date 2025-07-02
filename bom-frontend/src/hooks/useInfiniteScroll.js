// src/hooks/useInfiniteScroll.js (新文件)

import { useState, useCallback, useRef, useEffect } from 'react';
import { message } from 'antd';

export const useInfiniteScroll = (fetchFunction, initialParams = {}) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [params, setParams] = useState(initialParams);

    // 使用 useRef 来避免 useCallback 对 fetchFunction 的依赖
    const fetchFunctionRef = useRef(fetchFunction);
    useEffect(() => {
        fetchFunctionRef.current = fetchFunction;
    }, [fetchFunction]);

    const fetchData = useCallback(async (pageToFetch, searchParams, isNewSearch) => {
        if (loading && !isNewSearch) return;
        setLoading(true);
        try {
            const response = await fetchFunctionRef.current({
                page: pageToFetch,
                limit: 50,
                ...searchParams
            });
            const { data: newData, hasMore: newHasMore } = response.data;

            setData(prev => isNewSearch ? newData : [...prev, ...newData.filter(item => !prev.find(p => p.id === item.id))]);
            setHasMore(newHasMore);
            if (newHasMore) {
                setPage(pageToFetch + 1);
            }
        } catch (error) {
            message.error(error.response?.data?.error?.message || '加载列表失败');
        } finally {
            setLoading(false);
        }
    }, [loading]);

    useEffect(() => {
        fetchData(1, params, true);
    }, [params]); // 当搜索或排序参数变化时，重新从第一页加载

    const handleScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop - clientHeight < 150 && hasMore && !loading) {
            fetchData(page, params, false);
        }
    };

    const research = (newParams) => {
        setPage(1); // 重置页码
        setData([]); // 清空现有数据
        setParams(prev => ({ ...prev, ...newParams }));
    };

    const refresh = () => {
        fetchData(1, params, true);
    };

    const updateItemInData = (itemId, updatedValues) => {
        setData(prevData => prevData.map(item =>
            item.id === itemId ? { ...item, ...updatedValues } : item
        ));
    };

    return {
        data,
        loading,
        hasMore,
        handleScroll,
        research,
        refresh,
        setData,
        updateItemInData
    };
};