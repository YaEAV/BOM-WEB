// src/hooks/useInfiniteScroll.js (已修复无限循环问题)
import { useState, useCallback, useRef, useEffect } from 'react';

export const useInfiniteScroll = (fetchFunction, initialParams = {}, initialFetch = true) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    // 使用refs来存储那些不应触发重新渲染的状态
    const paramsRef = useRef(initialParams);
    const pageRef = useRef(1);
    const loadingRef = useRef(false);
    const fetchFunctionRef = useRef(fetchFunction);

    useEffect(() => {
        fetchFunctionRef.current = fetchFunction;
    }, [fetchFunction]);

    const fetchData = useCallback(async (isNewSearch) => {
        if (loadingRef.current) return;
        loadingRef.current = true;
        setLoading(true);

        const pageToFetch = isNewSearch ? 1 : pageRef.current;

        try {
            const response = await fetchFunctionRef.current({
                page: pageToFetch,
                limit: 50,
                ...paramsRef.current
            });
            const { data: newData, hasMore: newHasMore } = response.data;

            setData(prev => isNewSearch ? newData : [...prev, ...newData]);
            setHasMore(newHasMore);
            if (newHasMore) {
                pageRef.current = pageToFetch + 1;
            }
        } catch (error) {
            setHasMore(false);
            console.error('API call failed in useInfiniteScroll:', error);
        } finally {
            setLoading(false);
            loadingRef.current = false;
        }
    }, []); // 这个useCallback现在没有任何依赖，它是一个完全稳定的函数

    const research = useCallback((newParams) => {
        paramsRef.current = { ...initialParams, ...newParams };
        pageRef.current = 1;
        fetchData(true);
    }, [initialParams, fetchData]);

    const refresh = useCallback(() => {
        pageRef.current = 1;
        fetchData(true);
    }, [fetchData]);

    useEffect(() => {
        if (initialFetch) {
            research(initialParams);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialFetch]); // 这个effect只应在挂载时按需运行一次

    const handleScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop - clientHeight < 200 && hasMore && !loadingRef.current) {
            fetchData(false);
        }
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