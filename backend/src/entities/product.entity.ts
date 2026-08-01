import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../common/numeric.transformer';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  sku: string;

  @Column()
  name: string;

  @Column('numeric', { precision: 12, scale: 2, transformer: numericTransformer })
  price: number;

  @Column('int', { default: 0 })
  stockQuantity: number;

  @Column('int', { default: 0 })
  reservedQuantity: number;

  @CreateDateColumn()
  createdAt: Date;
}
