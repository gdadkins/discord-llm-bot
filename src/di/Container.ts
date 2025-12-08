import { TYPES } from './tokens';

type Constructor<T = any> = new (...args: any[]) => T;
type Factory<T> = (context: Container) => T;

interface Binding<T> {
    type: 'constant' | 'class' | 'dynamic';
    value?: T;
    implementation?: Constructor<T>;
    factory?: Factory<T>;
    singleton?: boolean;
    instance?: T;
}

export class Container {
    private bindings = new Map<symbol, Binding<any>>();

    bind<T>(token: symbol): { toConstantValue: (value: T) => Container; to: (implementation: Constructor<T>) => Container; toDynamicValue: (factory: Factory<T>) => Container; } {
        return {
            toConstantValue: (value: T): Container => {
                this.bindings.set(token, { type: 'constant', value, singleton: true });
                return this;
            },
            to: (implementation: Constructor<T>): Container => {
                this.bindings.set(token, { type: 'class', implementation, singleton: true }); // Default to singleton as per plan
                return this;
            },
            toDynamicValue: (factory: Factory<T>): Container => {
                this.bindings.set(token, { type: 'dynamic', factory, singleton: true });
                return this;
            }
        };
    }

    resolve<T>(token: symbol): T {
        const binding = this.bindings.get(token);
        if (!binding) {
            throw new Error(`No binding found for token: ${token.toString()}`);
        }

        if (binding.singleton && binding.instance) {
            return binding.instance;
        }

        let instance: T;

        switch (binding.type) {
            case 'constant':
                instance = binding.value!;
                break;
            case 'class':
                // Simple constructor injection (assuming 0 args or handle manually if needed, 
                // but for this bot most services have complex args so we likely use toDynamicValue or manual composition)
                // Ideally we would inspect params but that requires reflection metadata. 
                // For 'lightweight', we assume strict manual wiring via toDynamicValue for complex cases
                // or 0-arg constructors for simple cases.
                instance = new binding.implementation!();
                break;
            case 'dynamic':
                instance = binding.factory!(this);
                break;
            default:
                throw new Error(`Unknown binding type for token: ${token.toString()}`);
        }

        if (binding.singleton) {
            binding.instance = instance;
        }

        return instance;
    }

    // Helper to rebind or unbind if needed (mostly for testing)
    unbind(token: symbol) {
        this.bindings.delete(token);
    }

    isBound(token: symbol): boolean {
        return this.bindings.has(token);
    }
}
