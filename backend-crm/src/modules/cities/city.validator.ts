import { z } from 'zod';

/** Address columns store the city name in NVARCHAR(80). */
export const CITY_NAME_MAX = 80;

const countryCode = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, { message: 'Select a country.' });
const stateCode = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}-[A-Z0-9]{1,6}$/, { message: 'Select a state.' });
const cityName = z
    .string({ error: 'City name is required.' })
    .transform((name) => name.trim().replace(/\s+/g, ' '))
    .pipe(
        z
            .string()
            .min(1, { message: 'City name is required.' })
            .max(CITY_NAME_MAX, { message: `City names cannot exceed ${CITY_NAME_MAX} characters.` })
            .refine((name) => /[\p{L}\p{N}]/u.test(name), { message: 'Enter a city name.' }),
    );

export const cityIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const cityListQuerySchema = z.object({
    country: countryCode,
    /** A state's cities; omitted = every city of the country. */
    state: stateCode.optional().catch(undefined),
    search: z.string().trim().max(100).optional().catch(undefined),
    page: z.coerce.number().int().min(1).catch(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).catch(25).default(25),
});

export const cityCreateSchema = z.object({
    countryIso2: countryCode,
    /** Null for a country without states. */
    subdivisionCode: stateCode.nullable().optional(),
    cityName,
});

export const cityRenameSchema = z.object({ cityName });

/**
 * What happens to the records that use a city being deleted: `move` them to another city of the same state, or
 * `clear` their city. Required when any live record uses it.
 */
export const cityDeleteSchema = z
    .object({
        action: z.enum(['move', 'clear']).optional(),
        targetCityId: z.coerce.number().int().positive().optional(),
    })
    .refine((v) => v.action !== 'move' || v.targetCityId, { message: 'Pick the city to move the records to.', path: ['targetCityId'] });

export type CityListQuery = z.infer<typeof cityListQuerySchema>;
