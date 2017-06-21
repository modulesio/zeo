## Editor overview

The *editor* is how you build out your VR world. This basically involves finding and adding `mods` and related stuff.

Anyone on the server can edit the world anytime.

## Menu

Editing starts with the *menu*. That's a virtual browser window inside your VR world (which run in your real browser window, browserception).

To open/close the menu, press the `MENU` button. This work anywhere in the world; the menu will appear in front of you. Other people can see that you have your menu open.

To do stuff in your menu, you "click" by pointing and using your controller triggers. If you're using mouse controls this means literally clicking your mouse, but note the [controller selection keys](/docs/overview) -- you'll first need to select _which_ controller to click, using `Z`, `C`, or `X`.

There are a bunch of tabs to the menu: `Status`, `Mods`, `Entities`, `Servers`, `Wallet`, and `Config`. We'll dive into each of these below.

### Status tab

The *Status* tab is the most boring one. It just shows you what's up with the server and you.

The most important things here are the server you're on, the list of users, the server, URL, and whether your voice chat is enabled. But other than that you can't do anything ere. Next!

### Mods tab

The *Mods* tab is the bread and butter of adding stuff to your VR world. This is where you find mods to add, and then actually add them.

To add a mod, you first need to find it. That's what the search bar is for! When you click on the input field a virtual keyboard will pop up, allowing you to type what you're looking for. Use the keyboard to type pointing and clicking on the keys. Press the enter button on the virtual keyboard to close it.

As you type the list of search results will update. You can scroll through them with the arrows on the right side of the menu.

When you find a mod that looks interesting, click to open its mod page. If the mod has a readme file, you'll see it here (if it doesn't, go annoy the author to add one!). Just like the search results you cna scroll through the readme with the arrows on the right.

To add a mod to your world, click the button in the top right. This will create an Entity for it and open it in the Entities tab. Which leads us to...

### Entities tab

*Entities* are `mods` that you've added to your world. You can add the same mod to the world multiple times, in which case you'll have multiple entities for the same mod.

The entities tab looks a bit like the Mods tab, except it lists entities (copies mods you've added) instead of the actual installable mods. To find an entity you can use the search bar, which works the same way as the one on the Mods tab.

Each entity has its own configuration here. This could range from changing the position of the object, to changing some numbers (how many of the object there will be), to canging color, and more. Each mod works differently here, so make sure to read the mod's readme file if you need help. The controls should be pretty intuitive, and where necessary you can use the same virtual keyboard you're used to.

To add an entity, you'll actually start at the `Mods` page and add the module from there.

### Servers tab

The `Server`s tab is pretty straightforward. It just lists other _public servers_ you can connect to without leaving VR. Search for a server and click it to connect.

There are two kinds of servers: _public_ and _private_. Public servers will be listed here on the Servers tab, as well as on the main site. Your server starts out as _public_ by default, but you can change this on the Config tab (we'll get to that)

### Wallet tab

Your VR server comes with [`VRID` blockchain](/docs/vrid) integration that _carries across_ servers, so you can keep items and CRD ("credits") regardless of where you go.

The *Wallet* tab lets you see all items your VRID avatar has, and take them out of your wallet into the world. Search for an asset using the standard search input, then click the asset and click an amount to place it into the world.

Your item is as a unique pixel blob that flats in the world. If you move your controller over an item you'll see the name of the asset and how much there is in your HUD (heads up displace) in front of you. You can grab the item and place it in the world by holding the `GRIP` button. Some mods can interact with your item. For example, there are vending machines that give you stuff if you place the correct item into them. How it works is spelled out in each mod's readme file. &#x1F4D6;

You can also grab items and move them to your chest to add them to your wallet. This works regardless of whether it's your item or someone else's. You're welcome to trade items with your friends.

The magic is that _mods know about your items_! Mods will behave differently depending on whether you have a certain item. So the `sword` mod gives you different swords depending on the `SWORD` items you have in your VRID. This works automagically. &#x1F984;

You don't have to worry about how any of this works under the hood, but the short answer is your stuff lives on the `VRID` blockchain, and your browser stores the signing keys in a cookie. If you want to read more about that [/docs/vrid](there's a whole section for it).

### Config tab

The config tab lets you tweak the settings of your client (browser) and server.

The client settings are only for you, but the server settings affect everyone on the server. The client settings are only stored in your browser, but the server settings are saved on the server.

#### Client settings

- *Resolution*: Adjust graphics detail of the world. You should not change this unless you have performance issues. Lower settings will look worse but might give you a higher framete. Higher setting looks better but takes more processing power.

- *Stats*: Show an FPS counter in the corner of the menu.

#### Server settings

- *Visibility*: _Public_ or _private_. _Public_ is the default. The changes whether your server appears in public server lists (such as the Servers tab). _Public_ means it will appear and _private_ means it will be hidden. This _doesn't_ prevent people from joining your server if they find out the URL. For that you want to use a _Password_.

- *Password*: Password-protect your server. Everyone will need to know this password to join the server, even if they have the URL. If this is blank then there is no password. Don't get locked out!

- *Max players*: The number of players allowed on the server at the same time. This is deliberately limited for performance. You caan increase this but you might have performance problems, so be careful.

### Conclusion

That about wraps up the editor tutorial. Why not [test your new skillz with some mods](/mods)?