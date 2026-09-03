## Inspiration

Faultline started after a friend quit his job and we began practicing system design interviews together. We could talk through architectures back and forth, but we kept asking the same question: is this actually right? I wanted a better way to practice than negotiating with an LLM for an answer. I wanted a game where you make a design decision, find out whether it works, and see what that decision actually does to the system.

## What it does

Faultline is a systems design game. Every level gives you a problem, requirements, a workload, and a set of components; you design the system, and the simulator tells you the results. With WebMCP, an agent can join the live session, inspect the current design, and point out relevant parts of the canvas. Designed to act like another engineer in the room, the agent will help with questions but won't fully take over.

## How we built it

I started with the game itself. Parts like letting player build freely, simulator being the source of truth, and providing the agent with structured evidence from the components as opposed to the answer. Each level has its own rules, including what components are available, the performance of the components, and the requirments. WebMCP connects the live build data and passes it to the agent so it can give the player actual relevant advice without doing the problem for them.

## Challenges we ran into

The hardest part was keeping the agent reliable while a player rapidly changes an architecture. It needs the most up to date info for every call, but resending every detail was too slow. The app needed to only be frusterating with the challenges, so the agent experience for help needed to be fast just as much as it needed high quality responses. Getting the right current context to the agent efficiently and providing it with only the tools necessary for the state took a lot of evaluation.

## Accomplishments that we're proud of

I am proud of how the agents acts. I've had friends play with it, were unable to beat the level first couple tries and begrudgingly gave into using the coach, where they were surprised with the interactions. It really keeps you as the focus as just acts as a background tool so that you don't get stuck forever. This is best shown in the interview tool that asks follow up questions to let users practice the back and forths after designing the solution by using specific interviewer tools and keeping architecture facts straight as info changes.

## What we learned

This was my first time working with WebMCP, and I learned a lot about building for external agents inside a app. In particular, I learned more about tool routing, intent routing, and evaluations for checking whether an agent picks the best tool for the moment.

## What's next for Faultline

I would like to make it a daily game where you do one game a day just to keep yourself sharp. I would also like to keep expanding the coach's toolset and personality. I think during interview process if it could change the rules of the simulation and make you live build to solve a question would be pretty interesting and fun.
