export interface User {
    id: string;
    email: string;
    full_name: string;
    role: 'admin' | 'user';
    created_at: string;
}

export interface CreateUserDto {
    email: string;
    full_name: string;
    role: 'admin' | 'user';
    password?: string; // Optional for update, required for create logic usually handled separately
}

export interface UpdateUserDto extends Partial<CreateUserDto> { }
