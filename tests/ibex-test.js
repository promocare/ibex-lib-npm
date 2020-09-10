import { Ibex, log, FeedLoader } from "../ibex.js";

const FOAF = $rdf.Namespace('http://xmlns.com/foaf/0.1/');

const { AclApi, AclParser, Permissions, Agents } = SolidAclUtils;
const { READ, WRITE } = Permissions;
let aclApi = null;

let ibex = null;

let ibextest = {

    testIndex: 0,

    run() {
        ibex = new Ibex($('#user').text());

        setInterval(() => { $("#spinner").css("transform", "rotate(" + (ibex.fetchCount * 10) + "deg)") }, 200)

        aclApi = new AclApi(solid.auth.fetch.bind(solid.auth), { autoSave: true })

        this.testIndex = 0;
        this.runtest();

    },

    runtest(testnum = 0) {
        if (testnum >= this.tests.length) {
            log("all tests started, some promises might be lagging behind");
            return
        }
        log("running test", testnum);
        setTimeout(
            () => {
                let result = this.tests[testnum]();
                if (typeof result === 'object' && typeof result.then === 'function') {
                    result.finally(() => { this.runtest(testnum + 1) })
                    return;
                }
                this.runtest(testnum + 1)
            },
            0
        );

    },

    tests: [
        () => {
            return ibex
                .createFeed(ibex.defaultFeed)
                .catch((res) => fail(`can't create feed ${res.url}`))
                .then((res) => ibex.willFetch(res.url))
                .then((res) => assertGoodResponse(res, "can't fetch feed ", res.url, "I just created"))
                .then((res) => aclApi.loadFromFileUrl(res.url))
                .then((doc) => assertTrue(doc.hasRule(READ, Agents.PUBLIC), "PUBLIC should have READ privilege"))
        },
        () => {
            let content = "test post " + Math.random();
            return ibex.createPost(content).then(
                res => ibex.willFetch(res.url)
            ).then((res) => {
                assertGoodResponse(res, "the post should have been posted");
                res.text().then((t) => assertEqual(content, t, "the body of the post should be what we posted"))
                ibex.getPostText(res.url).then((t) => assertEqual(content, t, "the body of the post should be what we posted"))
                return ibex.deletePost(res.url);
            }).then((res) => {
                assertGoodResponse(res, "I can't delete the post I just posted");
                return ibex.willFetch(res.url)
            }).catch((res) => {
                assertEqual(res.status, 404, "Post should have been deleted, but is somehow still there");
                return res;
            })
        },
        () => {
            return ibex.willFetch(
                ibex.root() + "/../darcywashereyoucanremoveme.txt", {
                method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: "remove me whenever, this should not have been left here"
            }).then((r) => {
                fail("Darcy should not be able to write the file", r.url)
                return ibex.delete(r.url)
            }).catch((r) => pass("Darcy is not able to write in your root, good"))
        },
        () => {
            let giulio = 'https://giulio.localhost/profile/card#me';
            let fileUrl = ibex.root();
            const { AclApi, AclParser, Permissions } = SolidAclUtils;
            const { READ } = Permissions;

            aclApi
                .loadFromFileUrl(fileUrl)
                .then((acl) => acl.addRule(READ, giulio))
                .then(aclApi.loadFromFileUrl(fileUrl)) //again
                .then((doc) => {
                    assertTrue(doc.hasRule(READ, giulio), "giulio should have READ privilege");
                    return doc.deleteRule(READ, giulio);
                }).then(aclApi.loadFromFileUrl(fileUrl)) //againnnnn
                .then((doc) => {
                    return assertTrue(!doc.hasRule(READ, giulio), "giulio should not have READ privilege");
                });
        },
        () => {
            let testFeed = "testdelete";
            let testContent = "content test post to be deleted " + new Date();
            let feedUrl = null;
            let postUrl = null;

            return ibex.createFeed(testFeed)
                .then((res) => {
                    feedUrl = res.url;
                    return ibex.createPost(testContent, testFeed)
                })
                .then(assertGoodResponse)
                .then(res => {
                    postUrl = res.url;
                    return ibex.getPostText(postUrl)
                })
                .then(postText => assertEqual(postText, testContent))
                .then(() => ibex.deleteRecursive(feedUrl))
                .then(() => {
                    return ibex.willFetch(feedUrl)
                        .then((res) => fail("Darcy should not be able to read the feed", r.url))
                        .catch((res) => pass("Feeds can be created, posted on, and deleted"))
                })
        },
        () => {
            let testkey = "test-" + new Date();
            let testValue = Math.random();
            let originalSettings = {};
            return ibex.loadSettings()
                .then((oldSettings) => {
                    originalSettings = oldSettings;
                    return ibex.loadSettings();
                })
                .then((settings) => {
                    settings[testkey] = testValue;
                    return ibex.saveSettings(settings);
                })
                .then((res) => assertGoodResponse(res))
                .then(() => ibex.loadSettings())
                .then((newSettings) => {
                    assertEqual(testValue, newSettings[testkey], "the added config value was not saved");
                    delete newSettings[testkey];
                    return ibex.saveSettings(newSettings);
                })
                .then((res) => {
                    assertGoodResponse(res, "sembra aver salvato");
                    return ibex.loadSettings()
                })
                .then((finalSettings) => assertEqual(originalSettings, finalSettings))
                .catch((res) => {
                    fail("we failed to update settings, check the console");
                    console.log(res);
                })
                .finally(() => ibex.saveSettings(originalSettings))
        },
        () => {
            // load feed
            let testFeed = "testload";
            let testContent = () => { return "content test post to be deleted " + new Date(); }
            let feedUrl = null;

            let expectedPosts = [];

            return ibex.createFeed(testFeed)
                .then((res) => {
                    feedUrl = res.url;
                    let l = new FeedLoader(feedUrl);
                    return l.load()
                })
                .then((loader) => {
                    assertEqual(loader.posts(), []);
                    return ibex.createPost(testContent(), testFeed)
                        .then((res) => {
                            expectedPosts.push(res.url);
                            return loader.load()
                        })
                })
                .then((loader) => {
                    assertEqual(expectedPosts, loader.posts());
                    return ibex.createPost(testContent(), testFeed)
                        .then((res) => {
                            expectedPosts.push(res.url);
                            return loader.load()
                        })
                })
                .then((loader) => {
                    assertEqual(expectedPosts, loader.posts());
                })
                .finally(() => {
                    return ibex.deleteRecursive(feedUrl)
                });
        },
        () => {

            let testFeed = "testload";
            let testContent = () => { return "content test post to be deleted " + new Date(); }
            let feedUrl = null;
            let postCount = 4;
            let postsToBeFetched = 2;
            let createdPosts = []
            return ibex.createFeed(testFeed)
                .then((res) => {
                    feedUrl = res.url;

                    let timeCursor = new Date();
                    let originalDate = new Date(timeCursor);
                    let dT = 8000 * 1000;
                    log("creating a batch of posts, this will take a while...");

                    let createposts = (count) => {
                        return ibex
                            .createPost(testContent(), testFeed, null, null, new Date(timeCursor))
                            .then((res) => {
                                createdPosts.unshift(res.url);

                                count--;
                                timeCursor.setTime(timeCursor.getTime() - dT);
                                if (count) { return createposts(count); }
                            })

                    }

                    return createposts(postCount)
                        .then(() => {
                            log("done creating batch of posts");
                            let loader = new FeedLoader(feedUrl);
                            return loader.load(postsToBeFetched)
                                .then((posts) => {
                                    assertEqual(postsToBeFetched, posts.length, "the unbounded loader does not load the minimum amount of posts");
                                    assertEqual(
                                        createdPosts.slice(posts.length - createdPosts.length),
                                        posts,
                                        "the loader should have loaded the first " + postsToBeFetched + " posts in the correct order");

                                    let futureDate = new Date(new Date().getTime() + (86400 * 1000));
                                    return ibex.createPost(testContent(), testFeed, null, null, futureDate)
                                        .then((newerPost) => {
                                            return loader.loadOlder(20)
                                                .then((posts) => {
                                                    assertEqual(createdPosts, loader.posts(), "it should not have loaded the post in the future, it was looking only backwards");
                                                    return loader.loadNewer();
                                                })
                                                .then((allLoadedPosts) => {
                                                    createdPosts.push(newerPost.url);
                                                    assertEqual(createdPosts, allLoadedPosts);

                                                })
                                        })

                                })





                        })

                })

                .finally(() => {
                    return ibex.deleteRecursive(feedUrl, true)
                });


        }
    ]
};
function assertGoodResponse(response, ...banner) {
    banner = banner || '';
    let success = (response.status == 200 || response.status == 201);
    if (success) {
        pass();
    } else {
        fail(...banner, response.status, response.statusText);
    }
    return response;
}

function assertTrue(a, ...banner) {
    banner = banner || '';
    (!!a) ? pass() : fail(...banner, '[', a, '] should have been true-ish');
    return !!a;
}
function assertEqual(expected, result, ...banner) {
    banner = banner || '';
    let equal = JSON.stringify(expected) === JSON.stringify(result);
    if (equal) {
        pass();
    } else {
        fail(banner, "[", result, ']', "should have been", '[', expected, ']');
    }
    return equal;

}
function pass(...data) {
    $('#logchecks').append('✔️');
    if (!data || !data.length) { return }
    log("✔️", ...data);
}
function fail(...data) {
    $('#logchecks').append('❌');
    log("❌", ...data);
}

export default ibextest;