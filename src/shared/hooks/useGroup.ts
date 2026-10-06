import { useEffect, useState } from 'react';
import { listenToGroup } from '../firebase/groups';
import { Group } from '../types';

export const useGroup = (groupId: string) => {
    const [group, setGroup] = useState<Group | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!groupId) return;

        const unsubscribe = listenToGroup(groupId, (updatedGroup) => {
            setGroup(updatedGroup);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [groupId]);

    return { group, loading };
};