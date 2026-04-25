import { supabase } from '@/lib/supabase';
import type { User, CreateUserDto, UpdateUserDto } from '../domain/models/user';

export const userGateway = {
    getAll: async (): Promise<User[]> => {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as User[];
    },

    getById: async (id: string): Promise<User | null> => {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data as User;
    },

    create: async (user: CreateUserDto): Promise<User> => {
        // Note: Creating a user in Supabase Auth and a public users table usually requires
        // a server-side function or a trigger. For this demo, we'll assume a public 'users' table
        // or just insert into it directly if RLS allows.
        const { data, error } = await supabase
            .from('users')
            .insert([user])
            .select()
            .single();

        if (error) throw error;
        return data as User;
    },

    update: async (id: string, user: UpdateUserDto): Promise<User> => {
        const { data, error } = await supabase
            .from('users')
            .update(user)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as User;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
};
