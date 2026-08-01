import { ValueTransformer } from 'typeorm';

/** Postgres returns numeric/decimal columns as strings; convert to JS numbers. */
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value == null ? value : parseFloat(value)),
};
