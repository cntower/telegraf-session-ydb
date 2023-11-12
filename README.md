work in progress!

# `@icntower/telegraf-session-ydb`

This package provides YDB storage adapter for Telegraf v4.12+ sessions.

## YDB

Install the official YDB driver alongside this module.

```shell
npm i @icntower/telegraf-session-ydb ydb-sdk
```

Usage:

```TS
import { YDB } from "@icntower/telegraf-session-ydb";

const store = YDB({
  config: {
    ...
  },
});

const bot = new Telegraf(token, opts);
bot.use(session({ store }));

// the rest of your bot
```

To reuse an existing YDB client, use `YDB({ client })` instead.
