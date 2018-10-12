import { Observable, Subject } from 'rxjs'
import { map, share, switchMap } from 'rxjs/operators'
import { GQL } from '../../types/gqlschema'
import { getPlatformName } from '../util/context'
import { getContext } from './context'
import { createAggregateError } from './errors'
import { mutateGraphQLNoRetry } from './graphql'

/**
 * Creeates an observable pipeline to create access tokens for a user. This
 * ensures only one access token is created when multiple requests are going
 * out and all need to create a new access token. They all share the created
 * token.
 */
const buildAccessTokenCreator = () => {
    const userIDs = new Subject<string>()

    const accessTokenCreator = userIDs.pipe(
        switchMap(userID =>
            mutateGraphQLNoRetry(
                getContext({ repoKey: '' }),
                `
                mutation CreateAccessToken($userID: ID!, $scopes: [String!]!, $note: String!) {
                    createAccessToken(user: $userID, scopes: $scopes, note: $note) {
                        id
                        token
                    }
                }
                `,
                { userID, scopes: ['user:all'], note: `sourcegraph-${getPlatformName()}` },
                false
            )
        ),
        map(({ data, errors }) => {
            if (!data || !data.createAccessToken || (errors && errors.length > 0)) {
                throw createAggregateError(errors)
            }
            return data.createAccessToken.token
        }),
        share()
    )

    return (userID: GQL.ID): Observable<string> => {
        userIDs.next(userID)

        return accessTokenCreator
    }
}

/**
 * Create an access token for the current user on the currently configured
 * sourcegraph instance.
 */
export const createAccessToken = buildAccessTokenCreator()
