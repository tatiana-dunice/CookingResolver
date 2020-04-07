import { Op } from 'sequelize';
import { DateTime } from 'luxon';
import { SomeStatus, CookingComponent } from 'src/schema/entities/cooking';
import SomeInterestingModel from 'src/models/some.model';
export const getByCookingId = async (
    root: unknown,
    args: { cookingId: string }
): Promise<SomeInterestingModel | null> => {
    const cooking = await SomeInterestingModel.findOne({
        where: {
            cookingId: args.cookingId,
            staleAt: {
                [Op.eq]: null,
            },
            invalidatedAt: {
                [Op.eq]: null,
            },
        },
    });
    return cooking;
};
export const getByCookingPk = async (
    root: unknown,
    args: { сookingId: number }
): Promise<SomeInterestingModel | null> => {
    return await SomeInterestingModel.findByPk(args.сookingId);
};
interface CreateQueryParams {
    statuses: SomeStatus[];
    cookerUserId: number;
    jumperUserId: number;
    whereQuery?: unknown;
}
const createCookingByUserQuery = ({
                                      statuses = [],
                                      cookerUserId,
                                      jumperUserId,
                                      whereQuery = null,
                                  }: CreateQueryParams) => {
    const timeNow = new Date();
    const whereStatuses = statuses.length
        ? {
            [Op.or]: [
                ...statuses.map((status) => statusToQueryMap(status, timeNow)),
            ],
        }
        : null;
    const whereBlock = {
        [Op.and]: [
            { [Op.or]: [{ cookerUserId }, { jumperUserId }] },
            {
                staleAt: {
                    [Op.eq]: null,
                },
            },
            {
                invalidatedAt: {
                    [Op.eq]: null,
                },
            },
            whereStatuses,
            whereQuery,
        ],
    };
    return whereBlock;
};
const statusToQueryMap = (status: SomeStatus, timeNow: Date) => {
    const activeWindowStart = DateTime.fromJSDate(timeNow)
        .plus({ day: 1 })
        .toJSDate();
    if (status === 'UPCOMING') {
        return {
            [Op.and]: [
                { startDate: { [Op.gt]: activeWindowStart } },
                { isCancelled: false },
            ],
        };
    }
    if (status === 'ON_TRIP') {
        return {
            [Op.and]: [
                { startDate: { [Op.lte]: activeWindowStart } },
                { endDate: { [Op.gte]: timeNow } },
                { isCancelled: false },
            ],
        };
    }
    if (status === 'POST_TRIP') {
        return {
            [Op.and]: [{ endDate: { [Op.lt]: timeNow } }, { isCancelled: false }],
        };
    }
    if (status === 'CANCELED') {
        return { isCancelled: { [Op.eq]: true } };
    }
    // we expect some cases to have no actions [PROCESSING, CANCELLED]
    // cancelled will be corrected in a future PR
    return [];
};
export const countByUserId = (
    root: unknown,
    args: { userId: number; active?: boolean }
): Promise<number> => {
    let statuses: SomeStatus[] = [];
    if (typeof args.active !== undefined) {
        // the query below needs the following cases to be considered complete
        // (active true) ->  AND cooking not cancelled
        // (active false) -> OR cooking cancelled
        statuses = args.active
            ? [SomeStatus.Upcoming, SomeStatus.OnJump]
            : [SomeStatus.PostJump];
    }
    return SomeInterestingModel.count({
        where: createCookingByUserQuery({
            statuses,
            cookerUserId: args.userId,
            jumperUserId: args.userId,
        }),
    });
};
export const cookingsByUserId = (
    root: unknown,
    args: { userId: number; statuses?: SomeStatus[] }
): Promise<SomeInterestingModel[]> =>
    SomeInterestingModel.findAll({
        where: createCookingByUserQuery({
            statuses: args.statuses ?? [],
            cookerUserId: args.userId,
            jumperUserId: args.userId,
        }),
    });
export const getCookingComponents = (
    root: SomeInterestingModel
): CookingComponent[] => {
    const components = [];
    if (root.reservations.flights.length > 0) {
        components.push(CookingComponent.FLIGHT);
    }
    if (root.reservations.jumps.length > 0) {
        components.push(CookingComponent.JUMP);
    }
    return components;
};