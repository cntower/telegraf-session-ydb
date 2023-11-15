work in progress!

# `@icntower/telegraf-session-ydb`

This package provides YDB storage adapter for Telegraf v4.12+ sessions.

## YDB

Install the official YDB driver alongside this module.

```shell
npm i @icntower/telegraf-session-ydb ydb-sdk
```

Usage in Yandex Cloud Function:

```TS
import {
  Context as TelegrafContext,
  Scenes,
  session,
  Telegraf,
  SessionStore,
} from 'telegraf';
import { tgToken } from './tgToken';
import { Update } from 'telegraf/typings/core/types/typegram';
import { YDB } from '@icntower/telegraf-session-ydb';
import { getCredentialsFromEnv } from 'ydb-sdk';
import { Handler } from '@yandex-cloud/function-types';

interface MySceneSession extends Scenes.SceneSessionData {
  // will be available under `ctx.scene.session.mySceneSessionProp`
  mySceneSessionProp: number;
}

interface MyContext extends TelegrafContext {
  // will be available under `ctx.myContextProp`
  myContextProp: string;

  // declare scene type
  scene: Scenes.SceneContextScene<MyContext, MySceneSession>;
}

let ydbDbStore: SessionStore<unknown>;
const bot = new Telegraf<MyContext>(tgToken);

async function init() {
    // Handler factories
  const { enter, leave } = Scenes.Stage;

  // Greeter scene
  const greeterScene = new Scenes.BaseScene<MyContext>('greeter');
  greeterScene.enter((ctx) => ctx.reply('Hi'));
  greeterScene.leave((ctx) => ctx.reply('Bye'));
  greeterScene.hears('hi', enter<MyContext>('greeter'));
  greeterScene.on('message', (ctx) => ctx.replyWithMarkdown('Send `hi`'));

  // Echo scene
  const echoScene = new Scenes.BaseScene<MyContext>('echo');
  echoScene.enter((ctx) => ctx.reply('echo scene'));
  echoScene.leave((ctx) => ctx.reply('exiting echo scene'));
  echoScene.command('back', leave<MyContext>());
  echoScene.on('text', (ctx) => ctx.reply(ctx.message.text));
  echoScene.on('message', (ctx) => ctx.reply('Only text messages please'));

  const stage = new Scenes.Stage<MyContext>([greeterScene, echoScene], {
    ttl: 10,
  });

  ydbDbStore = await YDB({
    table: 'telegraf_sessions_ydb',
    config: {
      authService: getCredentialsFromEnv(),
      endpoint: process.env.YDB_ENDPOINT,
      database: process.env.YDB_DATABASE,
    },
  });

  bot.use(session({ store: ydbDbStore }));
  bot.use(stage.middleware());
  bot.use((ctx, next) => {
    // we now have access to the the fields defined above
    ctx.myContextProp ??= '';
    ctx.scene.session.mySceneSessionProp ??= 0;
    return next();
  });
  bot.command('greeter', (ctx) => ctx.scene.enter('greeter'));
  bot.command('echo', (ctx) => ctx.scene.enter('echo'));
  bot.on('message', (ctx) => ctx.reply('Try /echo or /greeter'));
}

export const botYdbHandler: Handler.Http = async (event, context) => {
  if (!ydbDbStore) await init();

  try {
    const message: Update = JSON.parse(event.body);
    await bot.handleUpdate(message);
  } catch (error) {
    return {
      statusCode: 500,
      body: error,
    };
  }

  return {
    statusCode: 200,
    body: '',
  };
};
```

To reuse an existing YDB client, use `YDB({ client })` instead.
