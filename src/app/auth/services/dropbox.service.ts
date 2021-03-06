import { Inject, Injectable, NgZone } from '@angular/core';
import { Actions, Effect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { Dropbox } from 'dropbox';
import { filter, tap } from 'rxjs/operators';
import { getSnapshot } from '../../utils/get-snapshot';
import { AuthActionTypes, Login, LoginFail, LoginSuccess, LogoutFail, LogoutSuccess } from '../actions/auth';
import { AuthenticationType } from '../models/authentication-type.model';
import { FailureType } from '../models/failure-type.model';
import { getAuthenticationInfo } from '../reducers/auth.selector';
import { AUTH_STORAGE_KEYS, AuthState } from '../reducers/auth.state';
import { getAccessTokenFromOAuthUrl } from '../utils/oauth';

@Injectable()
export class DropboxService {
  @Effect({ dispatch: false })
  private loginEffect = this.actions
    .ofType<Login>(AuthActionTypes.Login)
    .pipe(filter(action => action.payload.type === AuthenticationType.DROPBOX), tap(() => this.login()));

  @Effect({ dispatch: false })
  private logoutEffect = this.actions.ofType(AuthActionTypes.Logout).pipe(tap(() => this.logout()));

  private dropboxClient: Dropbox;

  constructor(
    @Inject('dropboxClientId') private clientId: string,
    private store: Store<AuthState>,
    private actions: Actions,
    private ngZone: NgZone
  ) {
    this.dropboxClient = new Dropbox({ clientId: this.clientId });

    window['dropboxPopUpCallback'] = url => ngZone.run(() => this.popUpCallBack(url));

    const savedAuthType = localStorage.getItem(AUTH_STORAGE_KEYS.type);
    const savedAccessToken = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken);

    if (savedAuthType && AuthenticationType[savedAuthType] === AuthenticationType.DROPBOX && savedAccessToken) {
      this.checkToken(savedAccessToken, false);
    }
  }

  private login() {
    const url = document.getElementsByTagName('base')[0].href;
    window.open(this.dropboxClient.getAuthenticationUrl(`${url}redirect-from-dropbox.html`), null, 'scrollbars=no,width=690,height=420');
  }

  private popUpCallBack(url: Location) {
    try {
      this.checkToken(getAccessTokenFromOAuthUrl(url));
    } catch (err) {
      this.store.dispatch(new LoginFail({ reason: err }));
    }
  }

  private async checkToken(accessToken: string, dispatchFailure: boolean = true): Promise<void> {
    try {
      const userDropbox = new Dropbox({ accessToken });
      const user = await userDropbox.usersGetCurrentAccount(null);
      this.store.dispatch(new LoginSuccess({ user: { name: user.name.given_name }, accessToken, type: AuthenticationType.DROPBOX }));
    } catch (err) {
      if (dispatchFailure) {
        this.store.dispatch(new LoginFail({ reason: FailureType.INVALID_TOKEN }));
      }
    }
  }

  private async logout() {
    const authInfo = await getSnapshot(this.store.select(getAuthenticationInfo));

    if (!authInfo || authInfo.type !== AuthenticationType.DROPBOX) {
      return;
    }

    try {
      await new Dropbox({ accessToken: authInfo.accessToken }).authTokenRevoke(null);
      this.store.dispatch(new LogoutSuccess());
    } catch (err) {
      this.store.dispatch(new LogoutFail());
    }
  }
}
