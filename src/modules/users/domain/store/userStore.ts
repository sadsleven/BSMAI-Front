import { create } from 'zustand';
import type { User, CreateUserDto, UpdateUserDto } from '../models/user';
import { userGateway } from '../../infrastructure/userGateway';

interface UserState {
    users: User[];
    isLoading: boolean;
    error: string | null;
    fetchUsers: () => Promise<void>;
    createUser: (user: CreateUserDto) => Promise<void>;
    updateUser: (id: string, user: UpdateUserDto) => Promise<void>;
    deleteUser: (id: string) => Promise<void>;
}

export const useUserStore = create<UserState>((set) => ({
    users: [],
    isLoading: false,
    error: null,

    fetchUsers: async () => {
        set({ isLoading: true, error: null });
        try {
            const users = await userGateway.getAll();
            set({ users });
        } catch (error: any) {
            set({ error: error.message });
        } finally {
            set({ isLoading: false });
        }
    },

    createUser: async (userDto) => {
        set({ isLoading: true, error: null });
        try {
            const newUser = await userGateway.create(userDto);
            set((state) => ({ users: [newUser, ...state.users] }));
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    updateUser: async (id, userDto) => {
        set({ isLoading: true, error: null });
        try {
            const updatedUser = await userGateway.update(id, userDto);
            set((state) => ({
                users: state.users.map((u) => (u.id === id ? updatedUser : u)),
            }));
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    deleteUser: async (id) => {
        set({ isLoading: true, error: null });
        try {
            await userGateway.delete(id);
            set((state) => ({
                users: state.users.filter((u) => u.id !== id),
            }));
        } catch (error: any) {
            set({ error: error.message });
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },
}));
